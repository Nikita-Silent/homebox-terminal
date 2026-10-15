import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  Actor,
  UserAccount,
  UserCreateInput,
  UserRole,
  UserUpdateInput,
} from '../../../shared/types/terminal'
import { TransferError } from '../transfers/types'
import { checkPin, hashPin, verifyPin } from './pin'

export interface AuthServiceOptions {
  /** SQLite file; the terminal keeps it next to the transfer journal. `:memory:` for tests. */
  path: string
  now?: () => Date
  /** Sign out after this much inactivity. */
  idleMinutes?: number
  /** Sign out after this long regardless of activity (end of shift). */
  maxSessionHours?: number
  maxAttempts?: number
  lockMinutes?: number
}

export interface SignedIn {
  token: string
  user: UserAccount
}

export type AuthService = ReturnType<typeof createAuthService>

interface UserRow {
  id: string
  name: string
  pin_hash: string
  role: UserRole
  active: number
  failed_attempts: number
  locked_until: string | null
  created_at: string
}

const MINUTE = 60_000
// Writing last_seen on every request is pointless; this is precise enough for the idle timeout.
const TOUCH_EVERY_MS = 30_000

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru').replaceAll('ё', 'е')
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

function cleanName(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (clean.length < 2 || clean.length > 60) throw new TransferError('VALIDATION', 'Имя — от 2 до 60 символов')
  return clean
}

function toAccount(row: UserRow): UserAccount {
  return { id: row.id, name: row.name, role: row.role, active: row.active === 1, createdAt: row.created_at }
}

/**
 * Employees and their sessions. Each employee signs in with a personal PIN so that every
 * transfer in the journal names who did it. Session tokens are stored only as SHA-256 hashes.
 */
export function createAuthService(options: AuthServiceOptions) {
  const idleMs = (options.idleMinutes ?? 15) * MINUTE
  const maxSessionMs = (options.maxSessionHours ?? 12) * 60 * MINUTE
  const maxAttempts = options.maxAttempts ?? 5
  const lockMs = (options.lockMinutes ?? 5) * MINUTE
  const clock = () => options.now?.() ?? new Date()
  const now = () => clock().toISOString()

  if (options.path !== ':memory:') mkdirSync(dirname(options.path), { recursive: true })
  const db = new DatabaseSync(options.path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      name_key        TEXT NOT NULL UNIQUE,
      pin_hash        TEXT NOT NULL,
      role            TEXT NOT NULL,
      active          INTEGER NOT NULL DEFAULT 1,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until    TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash   TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      created_at   TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
  `)

  const q = {
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByKey: db.prepare('SELECT * FROM users WHERE name_key = ?'),
    users: db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE'),
    activeAdmins: db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = \'admin\' AND active = 1'),
    insertUser: db.prepare(`INSERT INTO users (id, name, name_key, pin_hash, role, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)`),
    setFailures: db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?'),
    session: db.prepare(`SELECT u.*, s.created_at AS session_created_at, s.last_seen_at FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)'),
    touchSession: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    deleteStaleSessions: db.prepare('DELETE FROM sessions WHERE last_seen_at < ? OR created_at < ?'),
  }

  const getRow = (id: string) => q.user.get(id) as UserRow | undefined

  function requireRow(id: string) {
    const row = getRow(id)
    if (!row) throw new TransferError('NOT_FOUND', 'Сотрудник не найден')
    return row
  }

  function ensureUniqueName(name: string, exceptId?: string) {
    const existing = q.userByKey.get(nameKey(name)) as UserRow | undefined
    if (existing && existing.id !== exceptId) throw new TransferError('VALIDATION', 'Сотрудник с таким именем уже есть')
  }

  function lockedMinutesLeft(row: UserRow) {
    if (!row.locked_until) return 0
    const left = Date.parse(row.locked_until) - clock().getTime()
    return left > 0 ? Math.ceil(left / MINUTE) : 0
  }

  /** Active employees for the sign-in screen: names only. */
  function signInList(): Actor[] {
    return (q.users.all() as unknown as UserRow[]).filter(r => r.active === 1).map(r => ({ id: r.id, name: r.name }))
  }

  async function signIn(userId: string, pin: string): Promise<SignedIn> {
    const row = getRow(userId)
    if (!row) throw new TransferError('NOT_FOUND', 'Сотрудник не найден')
    if (row.active !== 1) throw new TransferError('FORBIDDEN', 'Сотрудник отключён. Обратитесь к администратору.')

    const locked = lockedMinutesLeft(row)
    if (locked) throw new TransferError('LOCKED', `Вход заблокирован на ${locked} мин. после неверных попыток`)
    // A lock that has run out starts a fresh count.
    const failures = row.locked_until ? 0 : row.failed_attempts

    if (!(await verifyPin(pin, row.pin_hash))) {
      const attempts = failures + 1
      if (attempts >= maxAttempts) {
        q.setFailures.run(0, new Date(clock().getTime() + lockMs).toISOString(), row.id)
        throw new TransferError('LOCKED', `Вход заблокирован на ${Math.ceil(lockMs / MINUTE)} мин. после неверных попыток`)
      }
      q.setFailures.run(attempts, null, row.id)
      throw new TransferError('WRONG_PIN', `Неверный PIN. Осталось попыток: ${maxAttempts - attempts}`)
    }

    q.setFailures.run(0, null, row.id)
    const token = randomBytes(32).toString('base64url')
    const at = now()
    q.insertSession.run(hashToken(token), row.id, at, at)
    return { token, user: toAccount(row) }
  }

  /** The employee behind a session token, or `null` when it is unknown, expired or disabled. */
  function authenticate(token: string | undefined): UserAccount | null {
    if (!token) return null
    const hash = hashToken(token)
    const row = q.session.get(hash) as (UserRow & { session_created_at: string, last_seen_at: string }) | undefined
    if (!row) return null
    const t = clock().getTime()
    const lastSeen = Date.parse(row.last_seen_at)
    if (row.active !== 1 || t - lastSeen >= idleMs || t - Date.parse(row.session_created_at) >= maxSessionMs) {
      q.deleteSession.run(hash)
      return null
    }
    if (t - lastSeen >= TOUCH_EVERY_MS) q.touchSession.run(new Date(t).toISOString(), hash)
    return toAccount(row)
  }

  function signOut(token: string | undefined) {
    if (token) q.deleteSession.run(hashToken(token))
  }

  function listUsers(): UserAccount[] {
    return (q.users.all() as unknown as UserRow[]).map(toAccount)
  }

  async function createUser(input: UserCreateInput): Promise<UserAccount> {
    const name = cleanName(input.name)
    ensureUniqueName(name)
    checkPin(input.pin, input.role)
    const id = randomUUID()
    const at = now()
    q.insertUser.run(id, name, nameKey(name), await hashPin(input.pin), input.role, at, at)
    return toAccount(requireRow(id))
  }

  async function updateUser(id: string, input: UserUpdateInput): Promise<UserAccount> {
    const row = requireRow(id)
    const role = input.role ?? row.role
    const active = input.active ?? row.active === 1
    const name = input.name === undefined ? row.name : cleanName(input.name)
    if (name !== row.name) ensureUniqueName(name, id)

    const losesAdmin = row.role === 'admin' && row.active === 1 && (role !== 'admin' || !active)
    if (losesAdmin && (q.activeAdmins.get() as { n: number }).n <= 1) {
      throw new TransferError('VALIDATION', 'Нужен хотя бы один администратор: сначала назначьте другого')
    }
    if (input.pin !== undefined) checkPin(input.pin, role)
    else if (role === 'admin' && row.role !== 'admin') {
      // Promotion keeps the old PIN only if it already meets the admin rules; otherwise a new one is required.
      throw new TransferError('VALIDATION', 'Для администратора задайте новый PIN от 6 до 8 цифр')
    }

    const pinHash = input.pin === undefined ? row.pin_hash : await hashPin(input.pin)
    db.prepare(`UPDATE users SET name = ?, name_key = ?, pin_hash = ?, role = ?, active = ?,
      failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?`).run(
      name,
      nameKey(name),
      pinHash,
      role,
      active ? 1 : 0,
      input.pin === undefined ? row.failed_attempts : 0,
      input.pin === undefined ? row.locked_until : null,
      now(),
      id,
    )
    // A disabled employee, a new PIN or a lost admin role ends every open session of that person.
    if (!active || input.pin !== undefined || role !== row.role) q.deleteUserSessions.run(id)
    return toAccount(requireRow(id))
  }

  /**
   * Creates the first administrator from the server settings when there is no active one,
   * so a fresh install (or a locked-out team) can always get in.
   */
  async function ensureAdmin(name: string, pin: string): Promise<'created' | 'restored' | 'exists'> {
    if ((q.activeAdmins.get() as { n: number }).n > 0) return 'exists'
    const existing = q.userByKey.get(nameKey(name)) as UserRow | undefined
    if (existing) {
      await updateUser(existing.id, { role: 'admin', active: true, pin })
      return 'restored'
    }
    await createUser({ name, pin, role: 'admin' })
    return 'created'
  }

  function purgeSessions() {
    const t = clock().getTime()
    q.deleteStaleSessions.run(new Date(t - idleMs).toISOString(), new Date(t - maxSessionMs).toISOString())
  }

  return {
    signInList,
    signIn,
    authenticate,
    signOut,
    listUsers,
    createUser,
    updateUser,
    ensureAdmin,
    purgeSessions,
    idleMinutes: idleMs / MINUTE,
    close: () => db.close(),
  }
}
