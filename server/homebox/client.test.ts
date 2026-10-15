import { describe, expect, it } from 'vitest'
import { createHomeboxClient, HomeboxError } from './client'

interface Call {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

function setup(respond: (call: Call) => Response | Promise<Response> = () => Response.json({})) {
  const calls: Call[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    const call = {
      method: init.method ?? 'GET',
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    }
    calls.push(call)
    return respond(call)
  }) as typeof globalThis.fetch
  const client = createHomeboxClient({ baseUrl: 'http://hb:7745///', token: 'hb_secret', fetch })
  return { client, calls }
}

describe('Homebox client', () => {
  it('sends the token and builds /api/v1 URLs with encoded ids', async () => {
    const { client, calls } = setup()
    await client.getEntity('a/b?c')
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'http://hb:7745/api/v1/entities/a%2Fb%3Fc',
      headers: { Authorization: 'Bearer hb_secret', Accept: 'application/json' },
    })
    expect(calls[0]!.headers['Content-Type']).toBeUndefined()
  })

  it('builds list queries with repeated parentIds and skips undefined params', async () => {
    const { client, calls } = setup(() => Response.json({ items: [], page: 1, pageSize: 50, total: 0 }))
    await client.listItems({ q: 'кро ко', parentIds: ['p1', 'p2'], pageSize: 1000 })
    await client.listItems({})
    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe('/api/v1/entities')
    expect(url.searchParams.get('q')).toBe('кро ко')
    expect(url.searchParams.getAll('parentIds')).toEqual(['p1', 'p2'])
    expect(url.searchParams.get('pageSize')).toBe('1000')
    expect(calls[1]!.url).toBe('http://hb:7745/api/v1/entities')
  })

  it('patches only the given fields', async () => {
    const { client, calls } = setup()
    await client.patchEntity({ id: 'x', quantity: 4 })
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: 'http://hb:7745/api/v1/entities/x', body: { id: 'x', quantity: 4 } })
    expect(calls[0]!.headers['Content-Type']).toBe('application/json')
  })

  it('renames with a full PUT copied from a fresh GET, so nothing is wiped', async () => {
    const current = {
      id: 'x', name: 'old', assetId: '000-007', quantity: 3, archived: false,
      parent: { id: 'shelf' }, entityType: { id: 'type' }, tags: [{ id: 't1' }], fields: [{ name: 'Инв.', type: 'text', textValue: '42' }],
      description: 'd', insured: true, lifetimeWarranty: false, manufacturer: 'M', modelNumber: 'N', notes: 'n',
      purchaseDate: '2026-01-01', purchaseFrom: 'shop', purchasePrice: 10, serialNumber: 'S', soldDate: '', soldNotes: '',
      soldPrice: 0, soldTo: '', syncChildEntityLocations: false, warrantyDetails: 'w', warrantyExpires: '',
    }
    const { client, calls } = setup(call => Response.json(call.method === 'GET' ? current : {}))
    await client.renameEntity('x', 'new')
    const put = calls[1]!
    expect(put.method).toBe('PUT')
    expect(put.body).toMatchObject({
      id: 'x', name: 'new', parentId: 'shelf', entityTypeId: 'type', tagIds: ['t1'], assetId: '000-007',
      quantity: 3, notes: 'n', serialNumber: 'S', fields: current.fields, purchasePrice: 10, insured: true,
    })
  })

  it('returns [] from an asset lookup without items', async () => {
    const { client, calls } = setup(() => Response.json({ items: null, page: 1, pageSize: 1, total: 0 }))
    expect(await client.getByAssetId('000-011')).toEqual([])
    expect(calls[0]!.url).toBe('http://hb:7745/api/v1/assets/000-011')
  })

  it('reports Homebox errors with status and message', async () => {
    const { client } = setup(() => Response.json({ error: 'entity not found' }, { status: 404, statusText: 'Not Found' }))
    const error = await client.getEntity('x').catch(e => e)
    expect(error).toBeInstanceOf(HomeboxError)
    expect(error).toMatchObject({ status: 404, message: 'entity not found', isNotFound: true })
  })

  it('falls back to the status text for non-JSON errors', async () => {
    const { client } = setup(() => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }))
    await expect(client.getLocationTree()).rejects.toMatchObject({ status: 502, message: 'Bad Gateway', isNotFound: false })
  })

  it('reports an unreachable Homebox as status 0', async () => {
    const { client } = setup(() => {
      throw new TypeError('fetch failed')
    })
    await expect(client.getPath('x')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('fetch failed') })
  })

  it('deletes, duplicates and downloads attachments with the right verbs', async () => {
    const { client, calls } = setup(() => new Response(null, { status: 200 }))
    await client.deleteEntity('x')
    await client.getAttachment('x', 'img')
    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
      'DELETE http://hb:7745/api/v1/entities/x',
      'GET http://hb:7745/api/v1/entities/x/attachments/img',
    ])
    const dup = setup(() => Response.json({ id: 'copy' }))
    const options = { copyAttachments: true, copyCustomFields: true, copyMaintenance: true, copyPrefix: '[hbt:1] ' }
    expect(await dup.client.duplicateEntity('x', options)).toEqual({ id: 'copy' })
    expect(dup.calls[0]).toMatchObject({ method: 'POST', url: 'http://hb:7745/api/v1/entities/x/duplicate', body: options })
  })
})
