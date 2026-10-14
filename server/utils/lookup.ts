const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ASSET_ID = /^(?:\d{3}-\d{3}|\d{1,6})$/

export type ScannedCode
  = | { kind: 'entity', id: string }
    | { kind: 'asset', assetId: string }
    | { kind: 'text', text: string }

/**
 * Interprets a scanned or typed code. Homebox labels encode URLs such as
 * `https://homebox/item/<uuid>`, `/location/<uuid>` or `/a/<assetId>`; other barcodes
 * (EAN, serial numbers) are treated as search text.
 */
export function parseScannedCode(raw: string): ScannedCode {
  const code = raw.trim()
  const assetPath = code.match(/\/a\/([\w-]+)\/?$/)
  if (assetPath) return { kind: 'asset', assetId: assetPath[1]! }
  const uuid = code.match(UUID)
  if (uuid) return { kind: 'entity', id: uuid[0].toLowerCase() }
  if (ASSET_ID.test(code)) return { kind: 'asset', assetId: code }
  return { kind: 'text', text: code }
}

export function looksLikeAssetId(text: string) {
  return ASSET_ID.test(text.trim())
}
