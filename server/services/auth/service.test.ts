import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createAuthService } from './service'

let now: Date
let auth: ReturnType<typeof createAuthService>
const minutes = (n: number) => {
  now = new Date(now.getTime() + n * 60_000)
}

beforeEach(() => {
  now = new Date('2026-10-15T08:00:00Z')
  auth = createAuthService({ path: ':memory:', now: () => now })
})
afterEach(() => auth.close())

describe('employees', () => {
  it('lists only active employees on the sign-in screen, sorted by name', async () => {
    const b = await auth.createUser({ name: 'Борис', pin: '4826', role: 'staff' })
    await auth.createUser({ name: 'Анна', pin: '604918', role: 'admin' })
    await auth.updateUser(b.id, { active: false })
    expect(auth.signInList().map(u => u.name)).toEqual(['Анна'])
    expect(auth.listUsers().map(u => [u.name, u.active])).toEqual([['Анна', true], ['Борис', false]])
  })

  it('normalises names and keeps them unique ignoring case, spaces and ё', async () => {
    const user = await auth.createUser({ name: '  Пётр   Иванов ', pin: '4826', role: 'staff' })
    expect(user.name).toBe('Пётр Иванов')
    await expect(auth.createUser({ name: 'петр иванов', pin: '5093', role: 'staff' })).rejects.toThrow('уже есть')
    await expect(auth.createUser({ name: 'Я', pin: '5093', role: 'staff' })).rejects.toThrow('от 2 до 60')
  })

  it('renames, but not onto another employee', async () => {
    const a = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    await auth.createUser({ name: 'Борис', pin: '5093', role: 'staff' })
    expect((await auth.updateUser(a.id, { name: 'Анна С.' })).name).toBe('Анна С.')
    await expect(auth.updateUser(a.id, { name: 'борис' })).rejects.toThrow('уже есть')
    expect((await auth.updateUser(a.id, { name: 'анна с.' })).name).toBe('анна с.')
  })

  it('requires a new admin-grade PIN to promote, and keeps one admin', async () => {
    const admin = await auth.createUser({ name: 'Анна', pin: '604918', role: 'admin' })
    const staff = await auth.createUser({ name: 'Борис', pin: '4826', role: 'staff' })
    await expect(auth.updateUser(staff.id, { role: 'admin' })).rejects.toThrow('новый PIN от 6 до 8')
    await expect(auth.updateUser(staff.id, { role: 'admin', pin: '4826' })).rejects.toThrow('от 6 до 8')
    await auth.updateUser(staff.id, { role: 'admin', pin: '730591' })
    // Two admins now: one may step down.
    await auth.updateUser(admin.id, { role: 'staff' })
    await expect(auth.updateUser(staff.id, { active: false })).rejects.toThrow('хотя бы один администратор')
  })

  it('reports unknown employees', async () => {
    await expect(auth.updateUser('nope', { active: false })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(auth.signIn('nope', '1234')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('sessions', () => {
  it('never stores the session token itself', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hbt-auth-'))
    const path = join(dir, 'auth.sqlite')
    const fileAuth = createAuthService({ path, now: () => now })
    const user = await fileAuth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    const { token } = await fileAuth.signIn(user.id, '4826')
    fileAuth.close()
    const db = new DatabaseSync(path)
    const stored = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[]
    const pins = db.prepare('SELECT pin_hash FROM users').all() as { pin_hash: string }[]
    db.close()
    rmSync(dir, { recursive: true })
    expect(stored).toHaveLength(1)
    expect(stored[0]!.token_hash).not.toBe(token)
    expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(pins[0]!.pin_hash).not.toContain('4826')
  })

  it('rejects missing and unknown tokens', () => {
    expect(auth.authenticate(undefined)).toBeNull()
    expect(auth.authenticate('made-up')).toBeNull()
  })

  it('ends a session after 12 hours even with constant activity', async () => {
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    const { token } = await auth.signIn(user.id, '4826')
    for (let i = 0; i < 71; i++) {
      minutes(10)
      expect(auth.authenticate(token), `after ${(i + 1) * 10} min`).not.toBeNull()
    }
    minutes(10)
    expect(auth.authenticate(token)).toBeNull()
  })

  it('signs out one session without touching others', async () => {
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    const first = await auth.signIn(user.id, '4826')
    const second = await auth.signIn(user.id, '4826')
    auth.signOut(first.token)
    auth.signOut(undefined)
    expect(auth.authenticate(first.token)).toBeNull()
    expect(auth.authenticate(second.token)?.name).toBe('Анна')
  })

  it('closes sessions on role change but not on rename', async () => {
    await auth.createUser({ name: 'Админ', pin: '604918', role: 'admin' })
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    const { token } = await auth.signIn(user.id, '4826')
    await auth.updateUser(user.id, { name: 'Анна С.' })
    expect(auth.authenticate(token)?.name).toBe('Анна С.')
    await auth.updateUser(user.id, { role: 'admin', pin: '730591' })
    expect(auth.authenticate(token)).toBeNull()
  })

  it('purges idle and expired sessions from the database', async () => {
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    const { token } = await auth.signIn(user.id, '4826')
    minutes(16)
    auth.purgeSessions()
    minutes(-16)
    // Even if the clock went back, the purged session is gone.
    expect(auth.authenticate(token)).toBeNull()
  })

  it('uses its configured idle timeout', async () => {
    const short = createAuthService({ path: ':memory:', now: () => now, idleMinutes: 2 })
    expect(short.idleMinutes).toBe(2)
    const user = await short.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    const { token } = await short.signIn(user.id, '4826')
    minutes(2)
    expect(short.authenticate(token)).toBeNull()
    short.close()
  })
})

describe('lockout', () => {
  it('counts failures per employee and resets on success', async () => {
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    for (const left of [4, 3]) {
      await expect(auth.signIn(user.id, '0000')).rejects.toThrow(`Осталось попыток: ${left}`)
    }
    await auth.signIn(user.id, '4826')
    await expect(auth.signIn(user.id, '0000')).rejects.toThrow('Осталось попыток: 4')
  })

  it('locks for 5 minutes and then starts a fresh count', async () => {
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    for (let i = 0; i < 4; i++) await auth.signIn(user.id, '0000').catch(() => {})
    await expect(auth.signIn(user.id, '0000')).rejects.toMatchObject({ code: 'LOCKED' })
    minutes(4)
    await expect(auth.signIn(user.id, '4826')).rejects.toThrow('заблокирован на 1 мин.')
    minutes(1)
    await expect(auth.signIn(user.id, '0000')).rejects.toThrow('Осталось попыток: 4')
  })

  it('a new PIN lifts the lock', async () => {
    const user = await auth.createUser({ name: 'Анна', pin: '4826', role: 'staff' })
    for (let i = 0; i < 5; i++) await auth.signIn(user.id, '0000').catch(() => {})
    await auth.updateUser(user.id, { pin: '5093' })
    expect((await auth.signIn(user.id, '5093')).user.name).toBe('Анна')
  })
})

describe('ensureAdmin', () => {
  it('does nothing while an active admin exists', async () => {
    await auth.createUser({ name: 'Анна', pin: '604918', role: 'admin' })
    expect(await auth.ensureAdmin('Администратор', '730591')).toBe('exists')
    expect(auth.listUsers()).toHaveLength(1)
  })

  it('restores an existing employee of that name as admin', async () => {
    const staff = await auth.createUser({ name: 'Администратор', pin: '4826', role: 'staff' })
    expect(await auth.ensureAdmin('администратор', '604918')).toBe('restored')
    expect(auth.listUsers()).toEqual([expect.objectContaining({ id: staff.id, role: 'admin', active: true })])
    expect((await auth.signIn(staff.id, '604918')).user.role).toBe('admin')
  })

  it('creates the admin on an empty database and validates the PIN', async () => {
    await expect(auth.ensureAdmin('Админ', '1234')).rejects.toThrow('от 6 до 8')
    expect(await auth.ensureAdmin('Админ', '604918')).toBe('created')
  })
})
