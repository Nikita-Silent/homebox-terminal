import { describe, expect, it } from 'vitest'
import { uuidV4 } from './uuid'

describe('uuidV4', () => {
  it('makes RFC 4122 version 4 ids that differ every time', () => {
    const ids = Array.from({ length: 200 }, uuidV4)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(new Set(ids).size).toBe(200)
  })
})
