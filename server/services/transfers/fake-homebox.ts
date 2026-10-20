// In-memory Homebox used by the transfer service and API tests. Mirrors the behaviour verified
// against Homebox 0.27.0 (see docs/homebox-api-notes.md), including that PATCH takes
// absolute quantities and duplicate copies into the source location with a name prefix.
import type { HbDuplicateOptions, HbEntity, HbEntityList, HbEntityPatch, HbPathItem, HbTreeItem } from '../../homebox/types'
import type { HomeboxPort } from './types'
import type { HomeboxClient } from '../../homebox/client'
import { HomeboxError } from '../../homebox/client'

type Method = keyof HomeboxPort

/** Runs before (`when: 'before'`) or after (`when: 'after'`) a call is applied; throw to inject a failure. */
export type FaultHook = (method: Method, args: unknown[], when: 'before' | 'after') => void

const LOCATION_TYPE = { id: 'type-location', name: 'Location', isLocation: true }
const ITEM_TYPE = { id: 'type-item', name: 'Item', isLocation: false }

export function createFakeHomebox() {
  const entities = new Map<string, HbEntity>()
  /** `entityId/attachmentId` → file, for the photo proxy. */
  const attachments = new Map<string, { type: string, body: Uint8Array }>()
  let seq = 0
  let fault: FaultHook | null = null
  let version = 'v0.27.0'

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

  function matches(e: HbEntity, q: string) {
    // `#000-011` is the asset id; otherwise every word, in any case, ё = е, in any of the text fields.
    if (q.startsWith('#')) return e.assetId === q.slice(1)
    const norm = (v: string) => v.toLocaleLowerCase('ru').replaceAll('ё', 'е')
    const text = norm([e.name, e.modelNumber, e.serialNumber, e.manufacturer, e.description, e.notes].join(' '))
    return norm(q).split(/\s+/).every(word => text.includes(word))
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
      const q = params.q?.trim()
      const items = [...entities.values()].filter(e =>
        !e.entityType.isLocation
        && (!q || matches(e, q))
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

  function tree(parentId: string | null): HbTreeItem[] {
    return [...entities.values()]
      .filter(e => e.entityType.isLocation && (e.parent?.id ?? null) === parentId)
      .map(e => ({ id: e.id, name: e.name, type: 'location', children: tree(e.id) }))
  }

  /** The full client surface the API handlers use; extra methods are not subject to faults. */
  const client: HomeboxClient = {
    ...port,
    async getStatus() {
      return { build: { version } }
    },
    async getByAssetId(assetId: string) {
      // Like Homebox: «000-011», «000011» and «11» all match; the result carries no photo ids.
      const wanted = Number(assetId.replace('-', ''))
      return [...entities.values()]
        .filter(e => Number(e.assetId.replace('-', '')) === wanted)
        .map(e => clone({ ...e, imageId: undefined, thumbnailId: undefined }))
    },
    async getLocationTree() {
      return tree(null)
    },
    async getAttachment(entityId: string, attachmentId: string) {
      const file = attachments.get(`${entityId}/${attachmentId}`)
      if (!file) throw new HomeboxError(404, 'Not Found')
      return new Response(new Uint8Array(file.body), { headers: { 'content-type': file.type } })
    },
  }

  return {
    port,
    client,
    /** Attaches a primary photo (and optionally a thumbnail) to an entity. */
    addPhoto(entityId: string, photo: { id: string, type: string, body?: Uint8Array, thumbnail?: { id: string, type: string } }) {
      const e = mustGet(entityId)
      e.imageId = photo.id
      attachments.set(`${entityId}/${photo.id}`, { type: photo.type, body: photo.body ?? new Uint8Array([1, 2, 3]) })
      if (photo.thumbnail) {
        e.thumbnailId = photo.thumbnail.id
        attachments.set(`${entityId}/${photo.thumbnail.id}`, { type: photo.thumbnail.type, body: new Uint8Array([4, 5]) })
      }
    },
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
    /** What `/v1/status` reports, e.g. `v0.28.0`. */
    setVersion(value: string) {
      version = value
    },
  }
}
