import type { LookupResult } from '#shared/types/terminal'

export function lookupCode(code: string) {
  return $fetch<LookupResult>('/api/items/lookup', { query: { code } })
}
