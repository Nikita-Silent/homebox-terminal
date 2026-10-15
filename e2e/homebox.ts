// Minimal Homebox API client for seeding and checking the disposable e2e instance.
export const HOMEBOX_URL = 'http://127.0.0.1:7746'

export interface Entity {
  id: string
  name: string
  assetId: string
  quantity: number
  parent?: { id: string, name: string } | null
  imageId?: string
  entityType: { isLocation: boolean }
}

export class Homebox {
  constructor(private readonly token: string) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${HOMEBOX_URL}/api/v1${path}`, {
      method,
      headers: { 'Authorization': `Bearer ${this.token}`, ...(body instanceof FormData || body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  private types = new Map<boolean, string>()

  /** A fresh Homebox has only the Location type; the Item type is created on first use, like the UI does. */
  private async typeId(isLocation: boolean) {
    const known = this.types.get(isLocation)
    if (known) return known
    const types = await this.request<{ id: string, isLocation: boolean }[]>('GET', '/entity-types')
    const id = types.find(t => t.isLocation === isLocation)?.id
      ?? (await this.request<{ id: string }>('POST', '/entity-types', { name: isLocation ? 'Location' : 'Item', isLocation })).id
    this.types.set(isLocation, id)
    return id
  }

  async location(name: string, parentId: string | null = null) {
    return this.request<Entity>('POST', '/entities', { name, parentId, entityTypeId: await this.typeId(true) })
  }

  async item(name: string, parentId: string, quantity = 1) {
    const created = await this.request<Entity>('POST', '/entities', { name, parentId, entityTypeId: await this.typeId(false), quantity })
    // Homebox ignores quantity on create for some types; set it explicitly.
    return this.request<Entity>('PATCH', `/entities/${created.id}`, { id: created.id, quantity })
  }

  get(id: string) {
    return this.request<Entity>('GET', `/entities/${id}`)
  }

  /** Items directly in a location. */
  async itemsIn(locationId: string) {
    const list = await this.request<{ items: Entity[] | null }>('GET', `/entities?parentIds=${locationId}&pageSize=1000`)
    return (list.items ?? []).filter(e => e.parent?.id === locationId)
  }

  async photo(entityId: string, file: { name: string, type: string, body: Uint8Array }) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(file.body)], { type: file.type }), file.name)
    form.append('type', 'photo')
    form.append('primary', 'true')
    form.append('name', file.name)
    await this.request('POST', `/entities/${entityId}/attachments`, form)
  }
}

/** Registers a user on a fresh instance and returns an API key. */
export async function createApiKey(): Promise<string> {
  const user = { name: 'E2E', email: 'e2e@homebox.local', password: 'e2e-password-123' }
  await fetch(`${HOMEBOX_URL}/api/v1/users/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) })
  const login = await fetch(`${HOMEBOX_URL}/api/v1/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.email, password: user.password }),
  })
  if (!login.ok) throw new Error(`Homebox login failed: ${login.status} ${await login.text()}`)
  const { token } = await login.json() as { token: string }
  const key = await fetch(`${HOMEBOX_URL}/api/v1/users/self/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token.startsWith('Bearer') ? token : `Bearer ${token}` },
    body: JSON.stringify({ name: 'terminal-e2e' }),
  })
  if (!key.ok) throw new Error(`API key failed: ${key.status} ${await key.text()}`)
  return (await key.json() as { token: string }).token
}
