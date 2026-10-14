// In-memory Homebox used by the transfer service tests. Mirrors the behaviour verified
// against Homebox 0.26.2 (see docs/homebox-api-notes.md), including that PATCH takes
// absolute quantities and duplicate copies into the source location with a name prefix.
import type { HbDuplicateOptions, HbEntity, HbEntityList, HbEntityPatch, HbPathItem } from '../../homebox/types'
import type { HomeboxPort } from './types'
import { HomeboxError } from '../../homebox/client'

type Method = keyof HomeboxPort

/** Runs before (`when: 'before'`) or after (`when: 'after'`) a call is applied; throw to inject a failure. */
export type FaultHook = (method: Method, args: unknown[], when: 'before' | 'after') => void

const LOCATION_TYPE = { id: 'type-location', name: 'Location', isLocation: true }
const ITEM_TYPE = { id: 'type-item', name: 'Item', isLocation: false }

export function createFakeHomebox() {
  const entities = new Map<string, HbEntity>()
  let seq = 0
  let fault: FaultHook | null = null

  function blank(id: string, name: string, isLocation: boolean, parentId: string | null): HbEntity {
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString()
    return {
      id,
      assetId: `000-${String(++seq).padStart(3, '0')}`,
      name,
      description: '',
      quantity: isLocation ? 0 : 1,
      archived: false,
      imageId: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      entityType: isLocation ? LOCATION_TYPE : ITEM_TYPE,
      parent: parentId ? summary(parentId) : null,
      tags: [],
      manufacturer: '',
      modelNumber: '',
      serialNumber: '',
      notes: '',
      insured: false,
      lifetimeWarranty: false,
      purchaseDate: '',
      purchaseFrom: '',
      purchasePrice: 0,
      soldDate: '',
      soldNotes: '',
      soldPrice: 0,
      soldTo: '',
      syncChildEntityLocations: false,
      warrantyDetails: '',
      warrantyExpires: '',
      fields: [],
      children: [],
    }
  }

  function summary(id: string) {
    const e = entities.get(id)!
    return { ...e, parent: null }
  }

  function mustGet(id: string) {
    const e = entities.get(id)
    if (!e) throw new HomeboxError(404, 'Not Found')
    return e
  }

  function clone<T>(value: T): T {
    return structuredClone(value)
  }

  async function call<T>(method: Method, args: unknown[], apply: () => T): Promise<T> {
    fault?.(method, args, 'before')
    const result = apply()
    fault?.(method, args, 'after')
    return clone(result)
  }

  const port: HomeboxPort = {
    getEntity: id => call('getEntity', [id], () => mustGet(id)),

    listItems: params => call('listItems', [params], (): HbEntityList => {
      // Like Homebox 0.26.2: the query is lower-cased fully, the columns ASCII-only (Cyrillic never matches).
      const q = params.q?.toLowerCase()
      const asciiLower = (v: string) => v.replace(/[A-Z]/g, c => c.toLowerCase())
      const items = [...entities.values()].filter(e =>
        !e.entityType.isLocation
        && (!q || [e.name, e.modelNumber, e.serialNumber].some(v => asciiLower(v).includes(q)))
        && (!params.parentIds?.length || params.parentIds.includes(e.parent?.id ?? '')))
      return { items, page: 1, pageSize: params.pageSize ?? 50, total: items.length }
    }),

    getPath: id => call('getPath', [id], () => {
      const path: HbPathItem[] = []
      for (let e: HbEntity | undefined = mustGet(id); e; e = e.parent ? entities.get(e.parent.id) : undefined) {
        path.unshift({ id: e.id, name: e.name, type: e.entityType.isLocation ? 'location' : 'item' })
      }
      return path
    }),

    patchEntity: (patch: HbEntityPatch) => call('patchEntity', [patch], () => {
      const e = mustGet(patch.id)
      if (patch.parentId !== undefined) e.parent = summary(patch.parentId)
      if (patch.quantity !== undefined) e.quantity = patch.quantity
      return e
    }),

    duplicateEntity: (id: string, options: HbDuplicateOptions) => call('duplicateEntity', [id, options], () => {
      const source = mustGet(id)
      const copyId = `copy-${++seq}`
      const copy: HbEntity = {
        ...clone(source),
        id: copyId,
        assetId: `000-${String(seq).padStart(3, '0')}`,
        name: `${options.copyPrefix || 'Copy of '}${source.name}`,
        fields: options.copyCustomFields ? clone(source.fields) : [],
      }
      entities.set(copyId, copy)
      return copy
    }),

    deleteEntity: (id: string) => call('deleteEntity', [id], () => {
      mustGet(id)
      entities.delete(id)
    }),

    renameEntity: (id: string, name: string) => call('renameEntity', [id, name], () => {
      const e = mustGet(id)
      e.name = name
      return e
    }),
  }

  return {
    port,
    addLocation(id: string, name: string, parentId: string | null = null) {
      entities.set(id, blank(id, name, true, parentId))
    },
    addItem(id: string, name: string, parentId: string, extra: Partial<HbEntity> = {}) {
      entities.set(id, { ...blank(id, name, false, parentId), ...extra })
    },
    get: (id: string) => entities.get(id),
    items: () => [...entities.values()].filter(e => !e.entityType.isLocation),
    setFault(hook: FaultHook | null) {
      fault = hook
    },
  }
}
