import type { HbEntity } from '../../homebox/types'
import type {
  LocationRef,
  TransferInput,
  TransferKind,
  TransferPreview,
  TransferPreviewInput,
  TransferResult,
} from '../../../shared/types/terminal'
import type {
  HomeboxPort,
  StepName,
  StepState,
  TransferContext,
  TransferJournal,
  TransferPlan,
  TransferRecord,
} from './types'
import type { KeyedMutex } from './mutex'
import { HomeboxError } from '../../homebox/client'
import { toItemDetail, toItemSummary, toLocationRef } from '../../homebox/mappers'
import { createKeyedMutex } from './mutex'
import { stepsFor, TransferError } from './types'

export interface TransferServiceDeps {
  homebox: HomeboxPort
  journal: TransferJournal
  withLocks?: KeyedMutex
  now?: () => Date
}

export type TransferService = ReturnType<typeof createTransferService>

/** Name prefix of a copy created by a split until the saga finishes; lets an interrupted copy be found again. */
export function copyMarker(opId: string) {
  return `[hbt:${opId}] `
}

/**
 * Records with quantity 1 are individually tracked units with their own history and are never
 * merged, neither as source nor as target. Only quantity-tracked records (> 1) are combined.
 */
export function isQuantityTracked(entity: { quantity: number }) {
  return entity.quantity > 1
}

/** Same product for merging: manufacturer + model when the model is set, otherwise the exact name. */
export function isSameProduct(a: HbEntity, b: HbEntity) {
  const norm = (value: string | undefined) => (value ?? '').trim().toLocaleLowerCase('ru')
  if (norm(a.modelNumber)) {
    return norm(a.modelNumber) === norm(b.modelNumber) && norm(a.manufacturer) === norm(b.manufacturer)
  }
  return !norm(b.modelNumber) && a.name.trim() === b.name.trim()
}

/** Raised inside the saga when it cannot safely decide how to continue. */
class NeedsAttention extends Error {}

function isTransient(error: unknown) {
  return error instanceof HomeboxError && (error.status === 0 || error.status === 429 || error.status >= 500)
}

function sameRequest(a: TransferInput, b: TransferInput) {
  return a.itemId === b.itemId
    && a.targetLocationId === b.targetLocationId
    && a.quantity === b.quantity
    && a.expectedQuantity === b.expectedQuantity
    && a.expectedLocationId === b.expectedLocationId
    && a.mergeIntoId === b.mergeIntoId
}

function lockKeys(input: TransferInput) {
  return input.mergeIntoId ? [input.itemId, input.mergeIntoId] : [input.itemId]
}

export function createTransferService(deps: TransferServiceDeps) {
  const { homebox, journal } = deps
  const withLocks = deps.withLocks ?? createKeyedMutex()
  const now = () => (deps.now?.() ?? new Date()).toISOString()

  async function loadEntity(id: string, notFoundMessage: string) {
    try {
      return await homebox.getEntity(id)
    }
    catch (error) {
      if (error instanceof HomeboxError && error.isNotFound) throw new TransferError('NOT_FOUND', notFoundMessage)
      throw error
    }
  }

  async function loadItem(id: string) {
    const item = await loadEntity(id, 'Оборудование не найдено в Homebox')
    if (item.entityType.isLocation) throw new TransferError('VALIDATION', 'Это локация, а не оборудование')
    return item
  }

  async function loadLocation(id: string) {
    const location = await loadEntity(id, 'Локация не найдена в Homebox')
    if (!location.entityType.isLocation) throw new TransferError('VALIDATION', 'Выбранное место не является локацией')
    return location
  }

  async function findMergeCandidates(source: HbEntity, targetId: string) {
    // No `q` filter: Homebox search ignores Cyrillic. A shelf holds few Items, list them all.
    const list = await homebox.listItems({ parentIds: [targetId], pageSize: 1000 })
    const hasModel = Boolean(source.modelNumber.trim())
    const ids = (list.items ?? [])
      .filter(item => item.id !== source.id && item.parent?.id === targetId && !item.archived && !item.entityType.isLocation)
      .filter(isQuantityTracked)
      // Summaries carry no model number; without a model the exact name decides, so skip the extra reads.
      .filter(item => hasModel || item.name.trim() === source.name.trim())
      .map(item => item.id)
      .slice(0, 100)
    const full = await Promise.all(ids.map(id => homebox.getEntity(id)))
    return full.filter(candidate => isQuantityTracked(candidate) && isSameProduct(source, candidate))
  }

  /** Whether the source may be merged at all: quantity-tracked and not a container. */
  function canMergeSource(source: HbEntity) {
    return isQuantityTracked(source) && !source.children?.length
  }

  /** Checks that apply to both preview and execution. Returns whether the whole Item moves. */
  function validate(input: TransferPreviewInput, source: HbEntity, target: HbEntity) {
    if (!Number.isInteger(input.quantity) || input.quantity < 0) {
      throw new TransferError('VALIDATION', 'Количество должно быть целым положительным числом')
    }
    if (source.quantity !== input.expectedQuantity) {
      throw new TransferError('STALE', `Количество изменилось: в Homebox сейчас ${source.quantity} шт. Обновите карточку.`)
    }
    if ((source.parent?.id ?? null) !== input.expectedLocationId) {
      throw new TransferError('STALE', 'Оборудование уже перемещено в другую локацию. Обновите карточку.')
    }
    if (target.id === source.id) {
      throw new TransferError('VALIDATION', 'Нельзя переместить оборудование само в себя')
    }
    if (target.id === source.parent?.id) {
      throw new TransferError('VALIDATION', 'Оборудование уже находится в этой локации')
    }

    const whole = input.quantity === source.quantity
    if (whole) return true

    if (input.quantity < 1) {
      throw new TransferError('VALIDATION', 'Количество должно быть не меньше 1')
    }
    if (input.quantity > source.quantity) {
      throw new TransferError('VALIDATION', `Нельзя переместить больше, чем есть: ${source.quantity} шт.`)
    }
    if (!Number.isInteger(source.quantity)) {
      throw new TransferError('VALIDATION', 'В Homebox указано дробное количество; такое оборудование можно переместить только целиком')
    }
    if (source.children?.length) {
      throw new TransferError('VALIDATION', 'Внутри оборудования есть другие предметы; его можно переместить только целиком')
    }
    return false
  }

  async function locationPath(location: HbEntity): Promise<LocationRef[]> {
    const path = await homebox.getPath(location.id)
    return path.map(p => ({ id: p.id, name: p.name }))
  }

  async function preview(input: TransferPreviewInput): Promise<TransferPreview> {
    const [source, target] = await Promise.all([loadItem(input.itemId), loadLocation(input.targetLocationId)])
    const whole = validate(input, source, target)
    const candidates = canMergeSource(source) ? await findMergeCandidates(source, target.id) : []
    const suggestedMergeIntoId = candidates.length === 1 ? candidates[0]!.id : null
    const [itemPath, targetPath] = await Promise.all([homebox.getPath(source.id), locationPath(target)])

    const kind: TransferKind = suggestedMergeIntoId ? 'merge' : whole ? 'whole' : 'split'
    return {
      kind,
      item: toItemDetail(source, itemPath),
      target: { id: target.id, name: target.name, path: targetPath },
      quantity: input.quantity,
      mergeCandidates: candidates.map(toItemSummary),
      suggestedMergeIntoId,
    }
  }

  async function plan(input: TransferInput): Promise<{ plan: TransferPlan, context: TransferContext }> {
    const [source, target] = await Promise.all([loadItem(input.itemId), loadLocation(input.targetLocationId)])
    const whole = validate(input, source, target)
    const base = { itemId: source.id, targetLocationId: target.id, quantity: input.quantity }
    const [itemPath, targetPath] = await Promise.all([homebox.getPath(source.id), locationPath(target)])
    const context: TransferContext = {
      itemName: source.name,
      itemAssetId: source.assetId,
      sourcePath: itemPath.filter(p => p.id !== source.id).map(p => ({ id: p.id, name: p.name })),
      targetPath,
      sourceQuantity: source.quantity,
      sourceLocation: toLocationRef(source.parent),
      targetLocation: { id: target.id, name: target.name },
      mergeIntoName: null,
      mergeIntoQuantity: null,
    }

    if (!input.mergeIntoId) return { plan: { kind: whole ? 'whole' : 'split', ...base }, context }

    if (!canMergeSource(source)) {
      throw new TransferError('VALIDATION', 'Поштучную запись (1 шт.) и предмет с вложениями объединять нельзя')
    }
    const mergeInto = await loadEntity(input.mergeIntoId, 'Запись для объединения не найдена в Homebox')
    if (mergeInto.id === source.id || mergeInto.entityType.isLocation || mergeInto.parent?.id !== target.id) {
      throw new TransferError('STALE', 'Запись для объединения больше не находится в целевой локации. Повторите выбор.')
    }
    if (!isSameProduct(source, mergeInto)) {
      throw new TransferError('VALIDATION', 'Запись для объединения — другой товар')
    }
    if (!isQuantityTracked(mergeInto)) {
      throw new TransferError('VALIDATION', 'В поштучную запись (1 шт.) добавлять количество нельзя')
    }
    context.mergeIntoName = mergeInto.name
    context.mergeIntoQuantity = mergeInto.quantity
    context.mergeIntoAssetId = mergeInto.assetId
    return { plan: { kind: 'merge', ...base, mergeIntoId: mergeInto.id, removeSource: whole }, context }
  }

  function save(record: TransferRecord) {
    record.updatedAt = now()
    journal.update(record)
  }

  function setStep(record: TransferRecord, step: StepName, state: StepState) {
    record.steps[step] = state
    save(record)
  }

  /**
   * Adds `delta` to an entity's quantity. Homebox only accepts absolute values and has no
   * compare-and-set, so the intended before/after pair is journaled before the write.
   */
  async function adjustQuantity(
    record: TransferRecord,
    step: StepName,
    entityId: string,
    delta: number,
    check?: (entity: HbEntity) => void,
  ) {
    const state = record.steps[step] ?? { status: 'pending' }
    const current = await homebox.getEntity(entityId)

    if (state.status === 'sent') {
      if (current.quantity === state.after) {
        setStep(record, step, { ...state, status: 'done' })
        return
      }
      if (current.quantity !== state.before) {
        throw new NeedsAttention(
          `Количество у «${current.name}» изменили во время операции: ожидалось ${state.before} или ${state.after}, `
          + `в Homebox ${current.quantity} шт.`,
        )
      }
    }
    else {
      check?.(current)
      const after = current.quantity + delta
      if (after < 0) {
        throw new NeedsAttention(`У «${current.name}» осталось ${current.quantity} шт. — недостаточно для перемещения`)
      }
      setStep(record, step, { status: 'sent', before: current.quantity, after })
    }

    await homebox.patchEntity({ id: entityId, quantity: record.steps[step]!.after })
    setStep(record, step, { ...record.steps[step]!, status: 'done' })
  }

  /**
   * Final step of a whole-quantity merge: subtract the moved quantity and delete the record once
   * it is empty. If someone added stock meanwhile, the remainder stays instead of being deleted.
   */
  async function removeSource(record: TransferRecord) {
    const { plan, context } = record
    const state = record.steps.removeSource ?? { status: 'pending' }
    let current: HbEntity | null
    try {
      current = await homebox.getEntity(plan.itemId)
    }
    catch (error) {
      if (!(error instanceof HomeboxError && error.isNotFound)) throw error
      current = null
    }

    if (state.status === 'sent') {
      const applied = state.after === 0 ? current === null : current?.quantity === state.after
      if (applied) {
        setStep(record, 'removeSource', { ...state, status: 'done' })
        return
      }
      if (current?.quantity !== state.before) {
        throw new NeedsAttention(`Исходную запись «${context.itemName}» изменили во время операции. Проверьте её в Homebox.`)
      }
    }
    else {
      if (!current) throw new NeedsAttention(`Исходную запись «${context.itemName}» удалили во время операции`)
      if (current.parent?.id !== context.sourceLocation?.id) {
        throw new NeedsAttention(`Исходную запись «${current.name}» переместили во время операции`)
      }
      if (current.children?.length) {
        throw new NeedsAttention(`В «${current.name}» появились вложенные предметы; запись не удалена`)
      }
      const after = current.quantity - plan.quantity
      if (after < 0) {
        throw new NeedsAttention(`У «${current.name}» осталось ${current.quantity} шт. — недостаточно для перемещения`)
      }
      setStep(record, 'removeSource', { status: 'sent', before: current.quantity, after })
    }

    const { after } = record.steps.removeSource!
    if (after === 0) await homebox.deleteEntity(plan.itemId)
    else await homebox.patchEntity({ id: plan.itemId, quantity: after })
    setStep(record, 'removeSource', { ...record.steps.removeSource!, status: 'done' })
  }

  async function findCopy(record: TransferRecord) {
    const marker = copyMarker(record.opId)
    const list = await homebox.listItems({ q: `hbt:${record.opId}`, pageSize: 10 })
    return (list.items ?? []).filter(item => item.name.startsWith(marker))
  }

  async function runStep(record: TransferRecord, step: StepName) {
    const { plan } = record
    const state = record.steps[step] ?? { status: 'pending' }

    switch (step) {
      case 'move': {
        setStep(record, step, { status: 'sent' })
        await homebox.patchEntity({ id: plan.itemId, parentId: plan.targetLocationId })
        setStep(record, step, { status: 'done' })
        return
      }

      case 'copy': {
        if (state.status === 'sent' && !record.copyId) {
          const found = await findCopy(record)
          if (found.length > 1) throw new NeedsAttention('Найдено несколько копий, созданных этой операцией')
          if (found.length === 1) {
            record.copyId = found[0]!.id
            record.copyAssetId = found[0]!.assetId
            setStep(record, step, { status: 'done' })
            return
          }
        }
        setStep(record, step, { status: 'sent' })
        const copy = await homebox.duplicateEntity(plan.itemId, {
          copyAttachments: true,
          copyCustomFields: true,
          copyMaintenance: true,
          copyPrefix: copyMarker(record.opId),
        })
        record.copyId = copy.id
        record.copyAssetId = copy.assetId
        setStep(record, step, { status: 'done' })
        return
      }

      case 'placeCopy': {
        // Absolute values: repeating this request is harmless.
        setStep(record, step, { status: 'sent' })
        await homebox.patchEntity({ id: record.copyId!, parentId: plan.targetLocationId, quantity: plan.quantity })
        setStep(record, step, { status: 'done' })
        return
      }

      case 'incrementTarget': {
        if (plan.kind !== 'merge') return
        await adjustQuantity(record, step, plan.mergeIntoId, plan.quantity, (target) => {
          if (target.parent?.id !== plan.targetLocationId) {
            throw new NeedsAttention(`«${target.name}» больше не находится в целевой локации`)
          }
        })
        return
      }

      case 'decrementSource': {
        await adjustQuantity(record, step, plan.itemId, -plan.quantity)
        return
      }

      case 'removeSource': {
        await removeSource(record)
        return
      }

      case 'renameCopy': {
        const marker = copyMarker(record.opId)
        const copy = await homebox.getEntity(record.copyId!)
        if (copy.name.startsWith(marker)) {
          setStep(record, step, { status: 'sent' })
          await homebox.renameEntity(copy.id, copy.name.slice(marker.length))
        }
        setStep(record, step, { status: 'done' })
      }
    }
  }

  function toResult(record: TransferRecord): TransferResult {
    const { plan, context, steps } = record
    const done = record.status === 'done'
    const sourceRemoved = done && plan.kind === 'merge' && plan.removeSource && steps.removeSource?.after === 0

    let sourceQuantity = context.sourceQuantity
    if (done && plan.kind !== 'whole') {
      sourceQuantity = steps.removeSource?.after ?? steps.decrementSource?.after ?? sourceQuantity
    }

    const targetPath = context.targetPath ?? [context.targetLocation]
    const sourcePath = context.sourcePath ?? (context.sourceLocation ? [context.sourceLocation] : [])

    let target: TransferResult['target'] = null
    if (done) {
      const at = { location: context.targetLocation, path: targetPath }
      if (plan.kind === 'whole') {
        target = { id: plan.itemId, assetId: context.itemAssetId ?? '', name: context.itemName, quantity: plan.quantity, ...at }
      }
      else if (plan.kind === 'merge') {
        target = {
          id: plan.mergeIntoId,
          assetId: context.mergeIntoAssetId ?? '',
          name: context.mergeIntoName ?? context.itemName,
          quantity: steps.incrementTarget?.after ?? (context.mergeIntoQuantity ?? 0) + plan.quantity,
          ...at,
        }
      }
      else if (record.copyId) {
        target = { id: record.copyId, assetId: record.copyAssetId ?? '', name: context.itemName, quantity: plan.quantity, ...at }
      }
    }

    return {
      opId: record.opId,
      status: record.status,
      kind: plan.kind,
      quantity: plan.quantity,
      source: {
        id: plan.itemId,
        name: context.itemName,
        quantity: sourceQuantity,
        location: plan.kind === 'whole' && done ? context.targetLocation : context.sourceLocation,
        path: plan.kind === 'whole' && done ? targetPath : sourcePath,
      },
      sourceRemoved,
      target,
      message: record.message,
    }
  }

  /** Drives the saga forward from wherever it stopped. Caller must hold the locks. */
  async function run(record: TransferRecord): Promise<TransferResult> {
    record.attempts += 1
    try {
      for (const step of stepsFor(record.plan)) {
        if (record.steps[step]?.status === 'done') continue
        await runStep(record, step)
      }
      record.status = 'done'
      record.message = null
    }
    catch (error) {
      const steps = Object.values(record.steps)
      const untouched = steps.every(step => step.status === 'pending')
      // A non-transient HTTP error is a definite answer: the last `sent` write was rejected, not applied.
      const rejected = error instanceof HomeboxError && !isTransient(error)
        && steps.every(step => step.status !== 'done')

      if (error instanceof NeedsAttention) {
        record.status = 'needs_attention'
        record.message = error.message
      }
      else if (untouched || rejected) {
        record.status = 'failed'
        record.message = isTransient(error)
          ? 'Homebox недоступен. Данные не изменены, повторите попытку.'
          : `Homebox отклонил операцию, данные не изменены: ${(error as Error).message}`
      }
      else if (isTransient(error)) {
        // A write may have reached Homebox: only finishing the saga keeps the data consistent.
        record.status = 'pending'
        record.message = 'Связь с Homebox прервалась. Операция будет завершена автоматически, повторять её не нужно.'
      }
      else {
        record.status = 'needs_attention'
        record.message = `Операция прервана на середине: ${(error as Error).message}. Проверьте данные в Homebox.`
      }
    }
    record.result = toResult(record)
    save(record)
    return record.result
  }

  async function execute(input: TransferInput): Promise<TransferResult> {
    return withLocks([`op:${input.opId}`], async () => {
      const existing = journal.get(input.opId)
      if (existing) {
        if (!sameRequest(existing.input, input)) {
          throw new TransferError('OP_CONFLICT', 'Идентификатор операции уже использован для другого перемещения')
        }
        if (existing.status !== 'pending') return existing.result ?? toResult(existing)
        return withLocks(lockKeys(existing.input), () => run(existing))
      }

      return withLocks(lockKeys(input), async () => {
        // Fresh reads under the item lock: the expected-quantity check is meaningful here.
        const { plan: accepted, context } = await plan(input)
        const timestamp = now()
        const record: TransferRecord = {
          opId: input.opId,
          status: 'pending',
          input,
          plan: accepted,
          context,
          steps: {},
          copyId: null,
          result: null,
          message: null,
          attempts: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        if (!journal.insert(record)) {
          throw new TransferError('OP_CONFLICT', 'Операция с таким идентификатором уже существует')
        }
        return run(record)
      })
    })
  }

  function getResult(opId: string): TransferResult | null {
    const record = journal.get(opId)
    return record ? record.result ?? toResult(record) : null
  }

  /** Finishes operations interrupted by a crash or a Homebox outage. */
  async function resumePending() {
    const results: TransferResult[] = []
    for (const pending of journal.listByStatus('pending')) {
      results.push(await withLocks([`op:${pending.opId}`], async () => {
        const record = journal.get(pending.opId)!
        if (record.status !== 'pending') return record.result ?? toResult(record)
        return withLocks(lockKeys(record.input), () => run(record))
      }))
    }
    return results
  }

  return { preview, execute, getResult, resumePending, findMergeCandidates }
}
