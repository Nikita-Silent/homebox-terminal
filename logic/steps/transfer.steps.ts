// Словарь шагов для сценариев в logic/features. Каждая фраза сценария выполняется
// против настоящего сервиса перемещений; вместо Homebox — его точная in-memory копия.
import { After, Before, Given, Then, When } from 'quickpickle'
import { expect } from 'vitest'
import type { Actor, TransferInput, TransferPreview, TransferResult } from '../../shared/types/terminal'
import type { HbEntity } from '../../server/homebox/types'
import { HomeboxError } from '../../server/homebox/client'
import { createFakeHomebox } from '../../server/services/transfers/fake-homebox'
import { createSqliteJournal } from '../../server/services/transfers/journal'
import { createTransferService } from '../../server/services/transfers/service'
import { TransferError } from '../../server/services/transfers/types'

export interface World {
  /** Scenario clock shared by every service («сегодня …», «прошло N минут»). */
  now: Date
  /** Who confirms transfers in phrases that do not name the employee. */
  actor: Actor
  hb: ReturnType<typeof createFakeHomebox>
  journal: ReturnType<typeof createSqliteJournal>
  service: ReturnType<typeof createTransferService>
  seq: number
  preview: TransferPreview | null
  result: TransferResult | null
  error: TransferError | null
  lastInput: TransferInput | null
  /** Id of the record that was moved, captured before the transfer (it may be deleted by a merge). */
  movedId: string | null
}

export const w = (state: unknown) => state as World

Before(async (state) => {
  const s = w(state)
  s.now = new Date('2026-10-15T09:00:00Z')
  s.actor = { id: 'user:Сотрудник', name: 'Сотрудник' }
  s.hb = createFakeHomebox()
  s.journal = createSqliteJournal(':memory:')
  s.service = createTransferService({ homebox: s.hb.port, journal: s.journal, now: () => s.now })
  s.seq = 0
  s.preview = null
  s.result = null
  s.error = null
  s.lastInput = null
  s.movedId = null
})

After(async (state) => {
  w(state).journal.close()
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const shelfId = (name: string) => `shelf:${name}`

function ensureShelf(s: World, name: string) {
  if (!s.hb.get(shelfId(name))) s.hb.addLocation(shelfId(name), name)
  return shelfId(name)
}

function recordsOn(s: World, name: string, shelf: string) {
  return s.hb.items().filter(i => i.name === name && i.parent?.id === shelfId(shelf))
}

function theRecord(s: World, name: string, shelf: string): HbEntity {
  const found = recordsOn(s, name, shelf)
  expect(found, `ожидалась одна запись «${name}» на полке «${shelf}»`).toHaveLength(1)
  return found[0]!
}

function addRecord(s: World, name: string, shelf: string, quantity: number, extra: Partial<HbEntity> = {}) {
  const parent = ensureShelf(s, shelf)
  s.hb.addItem(`item-${++s.seq}`, name, parent, { quantity, ...extra })
}

function newOpId(s: World) {
  return `00000000-0000-4000-8000-${String(++s.seq).padStart(12, '0')}`
}

async function run(s: World, fn: () => Promise<TransferResult>) {
  s.result = null
  s.error = null
  try {
    s.result = await fn()
  }
  catch (error) {
    if (!(error instanceof TransferError)) throw error
    s.error = error
  }
}

/** What the terminal does on «Подтвердить»: preview, take the suggested choice, execute. */
export async function transfer(
  s: World,
  opts: { quantity: number, name: string, from: string, to: string, seen?: number, separate?: boolean, actor?: Actor },
) {
  const source = theRecord(s, opts.name, opts.from)
  ensureShelf(s, opts.to)
  s.movedId = source.id
  const base = {
    itemId: source.id,
    targetLocationId: shelfId(opts.to),
    quantity: opts.quantity,
    expectedQuantity: opts.seen ?? source.quantity,
    expectedLocationId: shelfId(opts.from),
  }
  let mergeIntoId: string | null = null
  if (!opts.separate) {
    try {
      mergeIntoId = (await s.service.preview(base)).suggestedMergeIntoId
    }
    catch {
      // The execution below reports the same validation error.
    }
  }
  s.lastInput = { ...base, opId: newOpId(s), mergeIntoId }
  await run(s, () => s.service.execute(s.lastInput!, opts.actor ?? s.actor))
}

const STATUS: Record<string, TransferResult['status']> = {
  'выполнена': 'done',
  'ждёт завершения': 'pending',
  'требует проверки': 'needs_attention',
  'не выполнена': 'failed',
}

// ── Дано ─────────────────────────────────────────────────────────────────────

Given('на полке {string} лежит {string} {int} шт.', (state, shelf: string, name: string, qty: number) => {
  addRecord(w(state), name, shelf, qty)
})

Given(
  'на полке {string} лежит {string} {int} шт., производитель {string}, модель {string}',
  (state, shelf: string, name: string, qty: number, manufacturer: string, modelNumber: string) => {
    addRecord(w(state), name, shelf, qty, { manufacturer, modelNumber })
  },
)

Given('у {string} на полке {string} есть заметка {string}', (state, name: string, shelf: string, notes: string) => {
  theRecord(w(state), name, shelf).notes = notes
})

Given('у {string} на полке {string} есть поле {string} = {string}', (state, name: string, shelf: string, field: string, value: string) => {
  theRecord(w(state), name, shelf).fields = [{ name: field, type: 'text', textValue: value }]
})

Given('в Homebox у {string} на полке {string} стало {int} шт.', (state, name: string, shelf: string, qty: number) => {
  theRecord(w(state), name, shelf).quantity = qty
})

Given('связь с Homebox оборвётся после шага {string}', (state, step: string) => {
  const s = w(state)
  const methods: Record<string, { method: string, match?: (args: unknown[]) => boolean }> = {
    'создание копии': { method: 'duplicateEntity' },
    'добавление на целевую полку': {
      method: 'patchEntity',
      match: ([p]) => (p as { id: string }).id !== s.movedId && (p as { quantity?: number }).quantity !== undefined,
    },
    'списание с исходной полки': { method: 'patchEntity', match: ([p]) => (p as { id: string }).id === s.movedId },
    'удаление исходной записи': { method: 'deleteEntity' },
  }
  const fault = methods[step]
  if (!fault) throw new Error(`Неизвестный шаг «${step}». Доступны: ${Object.keys(methods).join(', ')}`)
  let fired = false
  s.hb.setFault((method, args, when) => {
    if (!fired && method === fault.method && when === 'after' && (!fault.match || fault.match(args))) {
      fired = true
      throw new HomeboxError(0, 'связь оборвалась')
    }
  })
})

Given('Homebox недоступен', (state) => {
  w(state).hb.setFault((method) => {
    if (method !== 'getEntity' && method !== 'listItems' && method !== 'getPath') throw new HomeboxError(0, 'нет связи')
  })
})

// ── Когда ────────────────────────────────────────────────────────────────────

When(
  'сотрудник переносит {int} шт. {string} с полки {string} на полку {string}',
  async (state, quantity: number, name: string, from: string, to: string) => {
    await transfer(w(state), { quantity, name, from, to })
  },
)

When(
  'сотрудник переносит {int} шт. {string} с полки {string} на полку {string} отдельной записью',
  async (state, quantity: number, name: string, from: string, to: string) => {
    await transfer(w(state), { quantity, name, from, to, separate: true })
  },
)

When(
  'сотрудник переносит {int} шт. {string} с полки {string} на полку {string}, видя в карточке {int} шт.',
  async (state, quantity: number, name: string, from: string, to: string, seen: number) => {
    await transfer(w(state), { quantity, name, from, to, seen })
  },
)

When(
  'сотрудник выбирает перенос {int} шт. {string} с полки {string} на полку {string}',
  async (state, quantity: number, name: string, from: string, to: string) => {
    const s = w(state)
    const source = theRecord(s, name, from)
    ensureShelf(s, to)
    s.preview = await s.service.preview({
      itemId: source.id,
      targetLocationId: shelfId(to),
      quantity,
      expectedQuantity: source.quantity,
      expectedLocationId: shelfId(from),
    })
  },
)

When('терминал повторно отправляет ту же операцию', async (state) => {
  const s = w(state)
  s.hb.setFault(null)
  await run(s, () => s.service.execute(s.lastInput!, s.actor))
})

When(
  'два терминала одновременно переносят по {int} шт. {string} с полки {string} на полку {string}',
  async (state, quantity: number, name: string, from: string, to: string) => {
    const s = w(state)
    const source = theRecord(s, name, from)
    ensureShelf(s, to)
    const base = {
      itemId: source.id,
      targetLocationId: shelfId(to),
      quantity,
      expectedQuantity: source.quantity,
      expectedLocationId: shelfId(from),
      mergeIntoId: null,
    }
    const outcomes = await Promise.allSettled([
      s.service.execute({ ...base, opId: newOpId(s) }, s.actor),
      s.service.execute({ ...base, opId: newOpId(s) }, s.actor),
    ])
    const done = outcomes.filter(o => o.status === 'fulfilled')
    const rejected = outcomes.filter(o => o.status === 'rejected')
    expect(done, 'выполниться должна ровно одна операция').toHaveLength(1)
    s.result = (done[0] as PromiseFulfilledResult<TransferResult>).value
    s.error = (rejected[0] as PromiseRejectedResult | undefined)?.reason ?? null
  },
)

When('сервер доводит незавершённые операции', async (state) => {
  const s = w(state)
  s.hb.setFault(null)
  const results = await s.service.resumePending()
  s.result = results.find(r => r.opId === s.lastInput?.opId) ?? s.result
})

// ── То ───────────────────────────────────────────────────────────────────────

Then('операция {string}', (state, status: string) => {
  const s = w(state)
  expect(STATUS[status], `неизвестный статус «${status}»`).toBeDefined()
  expect(s.error?.message ?? null, 'операция была отклонена').toBeNull()
  expect(s.result?.status).toBe(STATUS[status])
})

Then('операция отклонена с сообщением {string}', (state, text: string) => {
  const s = w(state)
  expect(s.error, 'ожидался отказ').not.toBeNull()
  expect(s.error!.message).toContain(text)
})

Then('второй терминал получает отказ {string}', (state, text: string) => {
  const s = w(state)
  expect(s.error, 'ожидался отказ второму терминалу').not.toBeNull()
  expect(s.error!.message).toContain(text)
})

Then('сотрудник видит сообщение {string}', (state, text: string) => {
  expect(w(state).result?.message ?? '').toContain(text)
})

Then('на полке {string} теперь {string} {int} шт.', (state, shelf: string, name: string, qty: number) => {
  expect(theRecord(w(state), name, shelf).quantity).toBe(qty)
})

Then(
  'на полке {string} {int} отдельные записи {string} по {int} шт.',
  (state, shelf: string, count: number, name: string, qty: number) => {
    const records = recordsOn(w(state), name, shelf)
    expect(records).toHaveLength(count)
    for (const r of records) expect(r.quantity).toBe(qty)
    expect(new Set(records.map(r => r.assetId)).size, 'у каждой записи свой UID').toBe(count)
  },
)

Then('на полке {string} нет {string}', (state, shelf: string, name: string) => {
  expect(recordsOn(w(state), name, shelf)).toHaveLength(0)
})

Then('всего {string} {int} шт.', (state, name: string, qty: number) => {
  const total = w(state).hb.items().filter(i => i.name === name).reduce((sum, i) => sum + i.quantity, 0)
  expect(total).toBe(qty)
})

Then('исходная запись удалена из Homebox', (state) => {
  const s = w(state)
  expect(s.hb.get(s.movedId!)).toBeUndefined()
})

Then('перенесена та же запись', (state) => {
  const s = w(state)
  expect(s.result?.target?.id).toBe(s.movedId)
})

Then('у {string} на полке {string} заметка {string}', (state, name: string, shelf: string, notes: string) => {
  expect(theRecord(w(state), name, shelf).notes).toBe(notes)
})

Then('у {string} на полке {string} поле {string} = {string}', (state, name: string, shelf: string, field: string, value: string) => {
  const fields = theRecord(w(state), name, shelf).fields ?? []
  expect(fields.find(f => f.name === field)?.textValue).toBe(value)
})

Then('терминал предлагает перенести запись целиком', (state) => {
  expect(w(state).preview).toMatchObject({ kind: 'whole', suggestedMergeIntoId: null })
})

Then('терминал предлагает создать новую запись', (state) => {
  expect(w(state).preview).toMatchObject({ kind: 'split', suggestedMergeIntoId: null })
})

Then('терминал предлагает добавить к записи, где сейчас {int} шт.', (state, qty: number) => {
  const preview = w(state).preview!
  expect(preview.kind).toBe('merge')
  expect(preview.mergeCandidates.find(c => c.id === preview.suggestedMergeIntoId)?.quantity).toBe(qty)
})

Then('терминал просит выбрать одну из {int} подходящих записей', (state, count: number) => {
  const preview = w(state).preview!
  expect(preview.suggestedMergeIntoId).toBeNull()
  expect(preview.mergeCandidates).toHaveLength(count)
})
