// DTOs shared between the Nuxt server (BFF) and the terminal UI.
// The UI never sees raw Homebox payloads, only these shapes.

export interface LocationRef {
  id: string
  name: string
}

export interface ItemSummary {
  id: string
  name: string
  assetId: string
  quantity: number
  manufacturer: string
  modelNumber: string
  location: LocationRef | null
  hasImage: boolean
}

export interface ItemDetail extends ItemSummary {
  serialNumber: string
  description: string
  /** Full location path from the root down to the item's direct parent. */
  locationPath: LocationRef[]
}

export interface LocationNode {
  id: string
  name: string
  children: LocationNode[]
}

export interface LookupResult {
  items: ItemSummary[]
  /** Set when the code is a location label (used to pick the target shelf). */
  location: LocationRef | null
}

/** One level of the location hierarchy, for browsing when the item's name is unknown. */
export interface LocationContents {
  location: LocationRef
  /** Root → this location. */
  path: LocationRef[]
  sublocations: LocationRef[]
  items: ItemSummary[]
}

export interface ItemSearchResult {
  items: ItemSummary[]
  total: number
}

/** How a requested transfer will be carried out. */
export type TransferKind
  /** The whole Item changes location. */
  = | 'whole'
  /** The quantity is added to an existing matching Item at the target (both must be quantity-tracked, > 1). */
    | 'merge'
  /** Part of the quantity becomes a new Item (copy) at the target. */
    | 'split'

export interface TransferInput {
  /** Client-generated id. Re-sending the same id never repeats the operation. */
  opId: string
  itemId: string
  targetLocationId: string
  quantity: number
  /** Quantity the user saw. The transfer is rejected if Homebox has a different value. */
  expectedQuantity: number
  /** Location the user saw. The transfer is rejected if the Item was moved meanwhile. */
  expectedLocationId: string | null
  /**
   * Partial transfer only: the matching Item at the target to add the quantity to.
   * `null` creates a new Item at the target instead.
   */
  mergeIntoId: string | null
}

export type TransferPreviewInput = Omit<TransferInput, 'opId' | 'mergeIntoId'>

export interface TransferPreview {
  kind: TransferKind
  item: ItemDetail
  target: LocationRef & { path: LocationRef[] }
  quantity: number
  /** Matching Items at the target that a partial transfer can be merged into. */
  mergeCandidates: ItemSummary[]
  /** The default choice for `mergeIntoId`: the only candidate, or `null` when there are none or several. */
  suggestedMergeIntoId: string | null
}

export type TransferStatus = 'pending' | 'done' | 'failed' | 'needs_attention'

export interface TransferResult {
  opId: string
  status: TransferStatus
  kind: TransferKind
  quantity: number
  /** The source Item after the transfer. For `whole` it is the moved Item itself. */
  source: { id: string, name: string, quantity: number, location: LocationRef | null, path: LocationRef[] }
  /** True when the whole quantity was merged into the target and the empty source record was deleted. */
  sourceRemoved: boolean
  /** The Item that received the quantity at the target. */
  target: {
    id: string
    /** UID of the record that received the quantity, as printed on its label. */
    assetId: string
    name: string
    quantity: number
    location: LocationRef | null
    /** Full location path from the root down to the target location. */
    path: LocationRef[]
  } | null
  /** Human-readable reason for `failed` / `needs_attention`. */
  message: string | null
}

/** Stable error codes returned by the BFF (in `data.code` of the error response). */
export type TerminalErrorCode
  = | 'HOMEBOX_UNAVAILABLE'
    | 'HOMEBOX_UNAUTHORIZED'
    | 'NOT_FOUND'
    | 'VALIDATION'
    | 'STALE'
    | 'BUSY'
    | 'OP_CONFLICT'
    | 'INTERNAL'
