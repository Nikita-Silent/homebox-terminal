// Subset of the Homebox 0.27.0 API schema that the terminal relies on.
// Full spec: docs/homebox-0.27.0-swagger.json. Behaviour notes: docs/homebox-api-notes.md.

export interface HbEntityType {
  id: string
  name: string
  isLocation: boolean
}

export interface HbTag {
  id: string
  name: string
}

export interface HbEntitySummary {
  id: string
  assetId: string
  name: string
  description: string
  quantity: number
  archived: boolean
  imageId?: string
  /** Homebox makes a ~500px WebP of the primary photo; absent until it is generated. */
  thumbnailId?: string
  createdAt: string
  updatedAt: string
  entityType: HbEntityType
  parent?: HbEntitySummary | null
  tags: HbTag[] | null
}

export interface HbEntityField {
  id?: string
  name: string
  type: string
  textValue?: string
  numberValue?: number
  booleanValue?: boolean
}

export interface HbEntity extends HbEntitySummary {
  manufacturer: string
  modelNumber: string
  serialNumber: string
  notes: string
  insured: boolean
  lifetimeWarranty: boolean
  purchaseDate: string
  purchaseFrom: string
  purchasePrice: number
  soldDate: string
  soldNotes: string
  soldPrice: number
  soldTo: string
  syncChildEntityLocations: boolean
  /**
   * 0.27.0+: own storage place of an item nested in another item; absent when the place is
   * inherited from the parent. Not in 0.26.2.
   */
  locationId?: string | null
  warrantyDetails: string
  warrantyExpires: string
  fields: HbEntityField[] | null
  children?: HbEntitySummary[] | null
}

export interface HbEntityList {
  items: HbEntitySummary[] | null
  page: number
  pageSize: number
  total: number
}

export interface HbTreeItem {
  id: string
  name: string
  type: string
  children: HbTreeItem[] | null
}

export interface HbPathItem {
  id: string
  name: string
  type: string
}

/** PATCH only touches the fields that are present. Safe for partial updates. */
export interface HbEntityPatch {
  id: string
  parentId?: string
  quantity?: number
}

export interface HbDuplicateOptions {
  copyAttachments: boolean
  copyCustomFields: boolean
  copyMaintenance: boolean
  copyPrefix: string
}
