// Словарь шагов для входа (06-login) и журнала перемещений (07-journal).
import { After, Before, Given, Then, When } from 'quickpickle'
import { expect } from 'vitest'
import type { UserRole } from '../../shared/types/terminal'
import type { World } from './transfer.steps'
import { createAuthService } from '../../server/services/auth/service'
import { TransferError } from '../../server/services/transfers/types'
import { transfer, w } from './transfer.steps'

interface AuthWorld extends World {
  auth: ReturnType<typeof createAuthService>
  /** Name → id and PIN of every employee the scenario created. */
  people: Map<string, { id: string, pin: string }>
  token: string | null
  signedInAs: string | null
  authError: TransferError | null
}

const a = (state: unknown) => state as AuthWorld
const ROLES: Record<string, UserRole> = { сотрудник: 'staff', администратор: 'admin' }
const DAY = 86_400_000

function newAuth(s: AuthWorld) {
  return createAuthService({ path: ':memory:', now: () => s.now, idleMinutes: 15, maxAttempts: 5, lockMinutes: 5 })
}

Before(async (state) => {
  const s = a(state)
  s.auth = newAuth(s)
  s.people = new Map()
  s.token = null
  s.signedInAs = null
  s.authError = null
})

After(async (state) => {
  a(state).auth.close()
})

function person(s: AuthWorld, name: string) {
  const found = s.people.get(name)
  if (!found) throw new Error(`Сотрудник «${name}» не заведён в сценарии`)
  return found
}

async function capture(s: AuthWorld, fn: () => Promise<unknown>) {
  s.authError = null
  try {
    await fn()
  }
  catch (error) {
    if (!(error instanceof TransferError)) throw error
    s.authError = error
  }
}

async function addPerson(s: AuthWorld, name: string, role: UserRole, pin: string) {
  const user = await s.auth.createUser({ name, role, pin })
  s.people.set(name, { id: user.id, pin })
}

async function signIn(s: AuthWorld, name: string, pin: string) {
  s.token = null
  s.signedInAs = null
  await capture(s, async () => {
    const signed = await s.auth.signIn(person(s, name).id, pin)
    s.token = signed.token
    s.signedInAs = signed.user.name
  })
}

const actorOf = (name: string) => ({ id: `user:${name}`, name })
const dayStart = (date: string) => new Date(`${date}T00:00:00Z`)

function journal(s: AuthWorld, opts: { from?: string, to?: string, who?: string } = {}) {
  return s.service.listJournal({
    from: opts.from ? dayStart(opts.from).toISOString() : '2000-01-01T00:00:00Z',
    to: opts.to ? new Date(dayStart(opts.to).getTime() + DAY).toISOString() : '2100-01-01T00:00:00Z',
    userId: opts.who ? actorOf(opts.who).id : undefined,
  })
}

// ── Вход ─────────────────────────────────────────────────────────────────────

Given('заведён сотрудник {string} с PIN {string}', async (state, name: string, pin: string) => {
  await addPerson(a(state), name, 'staff', pin)
})

Given('заведён администратор {string} с PIN {string}', async (state, name: string, pin: string) => {
  await addPerson(a(state), name, 'admin', pin)
})

Given('{string} вошёл в терминал', async (state, name: string) => {
  const s = a(state)
  await signIn(s, name, person(s, name).pin)
  expect(s.authError?.message ?? null).toBeNull()
})

Given('в терминале нет ни одного администратора', (state) => {
  const s = a(state)
  s.auth.close()
  s.auth = newAuth(s)
  s.people.clear()
})

When('{string} входит с PIN {string}', async (state, name: string, pin: string) => {
  await signIn(a(state), name, pin)
})

When('{string} {int} раз вводит неверный PIN', async (state, name: string, times: number) => {
  const s = a(state)
  for (let i = 0; i < times; i++) await signIn(s, name, 'неверный')
})

When('прошло {int} минут/минуты/минута', (state, minutes: number) => {
  const s = a(state)
  s.now = new Date(s.now.getTime() + minutes * 60_000)
})

When('администратор отключает {string}', async (state, name: string) => {
  const s = a(state)
  await capture(s, () => s.auth.updateUser(person(s, name).id, { active: false }))
})

When('администратор меняет PIN {string} на {string}', async (state, name: string, pin: string) => {
  const s = a(state)
  await capture(s, () => s.auth.updateUser(person(s, name).id, { pin }))
  expect(s.authError?.message ?? null).toBeNull()
})

When(
  'администратор заводит сотрудника {string} с ролью {string} и PIN {string}',
  async (state, name: string, role: string, pin: string) => {
    const s = a(state)
    expect(ROLES[role], `неизвестная роль «${role}»`).toBeDefined()
    await capture(s, () => addPerson(s, name, ROLES[role]!, pin))
  },
)

When('сервер запускается с администратором {string} и PIN {string}', async (state, name: string, pin: string) => {
  const s = a(state)
  await s.auth.ensureAdmin(name, pin)
  const admin = s.auth.listUsers().find(u => u.name === name)!
  s.people.set(name, { id: admin.id, pin })
})

Then('вход выполнен под именем {string}', (state, name: string) => {
  const s = a(state)
  expect(s.authError?.message ?? null, 'вход отклонён').toBeNull()
  expect(s.signedInAs).toBe(name)
  expect(s.auth.authenticate(s.token!)?.name).toBe(name)
})

Then('вход отклонён с сообщением {string}', (state, text: string) => {
  const s = a(state)
  expect(s.authError, 'ожидался отказ во входе').not.toBeNull()
  expect(s.authError!.message).toContain(text)
  expect(s.token).toBeNull()
})

Then('заведение отклонено с сообщением {string}', (state, text: string) => {
  const s = a(state)
  expect(s.authError, 'ожидался отказ').not.toBeNull()
  expect(s.authError!.message).toContain(text)
})

Then('изменение отклонено с сообщением {string}', (state, text: string) => {
  const s = a(state)
  expect(s.authError, 'ожидался отказ').not.toBeNull()
  expect(s.authError!.message).toContain(text)
})

Then('терминал всё ещё открыт для {string}', (state, name: string) => {
  const s = a(state)
  expect(s.auth.authenticate(s.token!)?.name).toBe(name)
})

Then('терминал просит войти заново', (state) => {
  const s = a(state)
  expect(s.auth.authenticate(s.token!)).toBeNull()
})

Then('{string} может войти с PIN {string} как администратор', async (state, name: string, pin: string) => {
  const s = a(state)
  await signIn(s, name, pin)
  expect(s.authError?.message ?? null).toBeNull()
  expect(s.auth.authenticate(s.token!)?.role).toBe('admin')
})

// ── Журнал ───────────────────────────────────────────────────────────────────

Given('сегодня {string}', (state, date: string) => {
  a(state).now = new Date(`${date}T09:00:00Z`)
})

When(
  '{string} переносит {int} шт. {string} с полки {string} на полку {string}',
  async (state, who: string, quantity: number, name: string, from: string, to: string) => {
    await transfer(w(state), { quantity, name, from, to, actor: actorOf(who) })
  },
)

When('сервер чистит журнал', (state) => {
  a(state).service.purgeJournal(5)
})

Then('в журнале {int} запись/записи/записей', (state, count: number) => {
  expect(journal(a(state))).toHaveLength(count)
})

Then(
  'за период с {string} по {string} в журнале {int} запись/записи/записей',
  (state, from: string, to: string, count: number) => {
    expect(journal(a(state), { from, to })).toHaveLength(count)
  },
)

Then('у {string} в журнале {int} запись/записи/записей', (state, who: string, count: number) => {
  expect(journal(a(state), { who })).toHaveLength(count)
})

Then(
  'за период с {string} по {string} у {string} в журнале {int} запись/записи/записей',
  (state, from: string, to: string, who: string, count: number) => {
    expect(journal(a(state), { from, to, who })).toHaveLength(count)
  },
)

Then(
  'в журнале: {string} перенёс {int} шт. {string} с {string} на {string}',
  (state, who: string, quantity: number, name: string, from: string, to: string) => {
    const entries = journal(a(state))
    expect(entries).toContainEqual(expect.objectContaining({
      actor: actorOf(who),
      quantity,
      status: 'done',
      item: expect.objectContaining({ name }),
      from: [expect.objectContaining({ name: from })],
      to: [expect.objectContaining({ name: to })],
    }))
  },
)
