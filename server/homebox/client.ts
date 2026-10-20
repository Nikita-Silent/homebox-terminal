import type {
  HbDuplicateOptions,
  HbEntity,
  HbEntityList,
  HbEntityPatch,
  HbPathItem,
  HbStatus,
  HbTreeItem,
} from './types'

export class HomeboxError extends Error {
  /** HTTP status from Homebox, or 0 when Homebox could not be reached. */
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HomeboxError'
    this.status = status
  }

  get isNotFound() {
    return this.status === 404
  }
}

export interface HomeboxClientOptions {
  baseUrl: string
  token: string
  timeoutMs?: number
  fetch?: typeof fetch
}

export type HomeboxClient = ReturnType<typeof createHomeboxClient>

export function createHomeboxClient(options: HomeboxClientOptions) {
  const apiBase = `${options.baseUrl.replace(/\/+$/, '')}/api/v1`
  const timeoutMs = options.timeoutMs ?? 15_000
  const doFetch = options.fetch ?? fetch

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    let response: Response
    try {
      response = await doFetch(`${apiBase}${path}`, {
        method,
        headers: {
          'Authorization': `Bearer ${options.token}`,
          'Accept': 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    }
    catch (error) {
      throw new HomeboxError(0, `Homebox is unreachable: ${(error as Error).message}`)
    }

    if (!response.ok) {
      let message = response.statusText
      try {
        const data = await response.json() as { error?: string }
        message = data.error ?? message
      }
      catch {
        // Non-JSON error body; keep the status text.
      }
      throw new HomeboxError(response.status, message)
    }
    return response
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await send(method, path, body)
    return await response.json() as T
  }

  function query(params: Record<string, string | number | string[] | undefined>) {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      for (const v of Array.isArray(value) ? value : [value]) search.append(key, String(v))
    }
    const s = search.toString()
    return s ? `?${s}` : ''
  }

  function getEntity(id: string) {
    return request<HbEntity>('GET', `/entities/${encodeURIComponent(id)}`)
  }

  return {
    getEntity,

    getStatus() {
      return request<HbStatus>('GET', '/status')
    },

    /**
     * Lists non-location entities. `parentIds` is not recursive. `q` matches name, model and serial
     * number; from 0.27.0 also notes, tags and custom fields, and `#000-011` matches the asset id.
     */
    listItems(params: { q?: string, parentIds?: string[], page?: number, pageSize?: number }) {
      return request<HbEntityList>('GET', `/entities${query(params)}`)
    },

    /** Accepts `000-011`, `000011` or `11`. */
    async getByAssetId(assetId: string) {
      const result = await request<HbEntityList>('GET', `/assets/${encodeURIComponent(assetId)}`)
      return result.items ?? []
    },

    getLocationTree() {
      return request<HbTreeItem[]>('GET', '/entities/tree')
    },

    /** Path from the root to the entity itself (the last element is the entity). */
    getPath(id: string) {
      return request<HbPathItem[]>('GET', `/entities/${encodeURIComponent(id)}/path`)
    },

    patchEntity(patch: HbEntityPatch) {
      return request<HbEntity>('PATCH', `/entities/${encodeURIComponent(patch.id)}`, patch)
    },

    /** Creates a copy in the same location with the same quantity; the name gets `copyPrefix`. */
    duplicateEntity(id: string, options: HbDuplicateOptions) {
      return request<HbEntity>('POST', `/entities/${encodeURIComponent(id)}/duplicate`, options)
    },

    /**
     * Renames an entity. Homebox has no partial update for the name, and PUT replaces the whole
     * record (omitted fields are cleared), so every field is copied from a fresh GET.
     */
    async renameEntity(id: string, name: string) {
      const current = await getEntity(id)
      const update = {
        id: current.id,
        name,
        parentId: current.parent?.id,
        locationId: current.locationId ?? undefined,
        entityTypeId: current.entityType.id,
        tagIds: (current.tags ?? []).map(tag => tag.id),
        fields: current.fields ?? [],
        archived: current.archived,
        assetId: current.assetId,
        description: current.description,
        insured: current.insured,
        lifetimeWarranty: current.lifetimeWarranty,
        manufacturer: current.manufacturer,
        modelNumber: current.modelNumber,
        notes: current.notes,
        purchaseDate: current.purchaseDate,
        purchaseFrom: current.purchaseFrom,
        purchasePrice: current.purchasePrice,
        quantity: current.quantity,
        serialNumber: current.serialNumber,
        soldDate: current.soldDate,
        soldNotes: current.soldNotes,
        soldPrice: current.soldPrice,
        soldTo: current.soldTo,
        syncChildEntityLocations: current.syncChildEntityLocations,
        warrantyDetails: current.warrantyDetails,
        warrantyExpires: current.warrantyExpires,
      }
      return request<HbEntity>('PUT', `/entities/${encodeURIComponent(id)}`, update)
    },

    async deleteEntity(id: string): Promise<void> {
      await send('DELETE', `/entities/${encodeURIComponent(id)}`)
    },

    /** Raw attachment download (used to proxy item photos to the browser). */
    getAttachment(entityId: string, attachmentId: string) {
      return send('GET', `/entities/${encodeURIComponent(entityId)}/attachments/${encodeURIComponent(attachmentId)}`)
    },
  }
}
