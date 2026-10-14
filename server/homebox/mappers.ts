import type { ItemDetail, ItemSummary, LocationNode, LocationRef } from '../../shared/types/terminal'

import type { HbEntity, HbEntitySummary, HbPathItem, HbTreeItem } from './types'

export function toLocationRef(entity: { id: string, name: string } | null | undefined): LocationRef | null {
  return entity ? { id: entity.id, name: entity.name } : null
}

export function toItemSummary(entity: HbEntitySummary | HbEntity): ItemSummary {
  return {
    id: entity.id,
    name: entity.name,
    assetId: entity.assetId,
    quantity: entity.quantity,
    manufacturer: 'manufacturer' in entity ? entity.manufacturer : '',
    modelNumber: 'modelNumber' in entity ? entity.modelNumber : '',
    location: toLocationRef(entity.parent),
    hasImage: Boolean(entity.imageId),
  }
}

/** `path` is the Homebox path of the item itself (root … parent, item). */
export function toItemDetail(entity: HbEntity, path: HbPathItem[]): ItemDetail {
  return {
    ...toItemSummary(entity),
    serialNumber: entity.serialNumber,
    description: entity.description,
    locationPath: path.filter(p => p.id !== entity.id).map(p => ({ id: p.id, name: p.name })),
  }
}

export function toLocationTree(nodes: HbTreeItem[] | null): LocationNode[] {
  return (nodes ?? [])
    .filter(node => node.type === 'location')
    .map(node => ({ id: node.id, name: node.name, children: toLocationTree(node.children) }))
}
