import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { UserRole } from '../../../shared/types/terminal'
import { TransferError } from '../transfers/types'

const KEY_LENGTH = 32

function derive(pin: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

/** `scrypt$<salt>$<key>`, both base64. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(pin, salt)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await derive(pin, Buffer.from(salt, 'base64'))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Same digit repeated, or a straight run up or down (1234, 9876). */
function isTrivial(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true
  const digits = [...pin].map(Number)
  const steps = new Set(digits.slice(1).map((d, i) => d - digits[i]!))
  return steps.size === 1 && (steps.has(1) || steps.has(-1))
}

/** Admins guard the employee list, so their PIN is longer. */
export function checkPin(pin: string, role: UserRole) {
  if (!/^\d+$/.test(pin)) throw new TransferError('VALIDATION', 'PIN — только цифры')
  const [min, max] = role === 'admin' ? [6, 8] : [4, 8]
  if (pin.length < min || pin.length > max) {
    throw new TransferError(
      'VALIDATION',
      `PIN ${role === 'admin' ? 'администратора' : 'сотрудника'} — от ${min} до ${max} цифр`,
    )
  }
  if (isTrivial(pin)) throw new TransferError('VALIDATION', 'Слишком простой PIN: не используйте одинаковые цифры или 1234')
}
