import { describe, expect, it } from 'vitest'
import { checkPin, hashPin, verifyPin } from './pin'

describe('hashPin / verifyPin', () => {
  it('verifies the right PIN and rejects others', async () => {
    const stored = await hashPin('4826')
    expect(stored).toMatch(/^scrypt\$[\w+/=]+\$[\w+/=]+$/)
    expect(stored).not.toContain('4826')
    expect(await verifyPin('4826', stored)).toBe(true)
    expect(await verifyPin('4827', stored)).toBe(false)
  })

  it('salts every hash', async () => {
    expect(await hashPin('4826')).not.toBe(await hashPin('4826'))
  })

  it('rejects malformed stored values instead of throwing', async () => {
    expect(await verifyPin('4826', '')).toBe(false)
    expect(await verifyPin('4826', 'bcrypt$x$y')).toBe(false)
    expect(await verifyPin('4826', 'scrypt$onlysalt')).toBe(false)
  })
})

describe('checkPin', () => {
  it('accepts 4–8 digits for staff and 6–8 for admins', () => {
    expect(() => checkPin('4826', 'staff')).not.toThrow()
    expect(() => checkPin('48261937', 'staff')).not.toThrow()
    expect(() => checkPin('604918', 'admin')).not.toThrow()
  })

  it.each([
    ['48a6', 'staff', 'только цифры'],
    ['', 'staff', 'только цифры'],
    ['482', 'staff', 'от 4 до 8'],
    ['482619371', 'staff', 'от 4 до 8'],
    ['48261', 'admin', 'от 6 до 8'],
    ['0000', 'staff', 'Слишком простой'],
    ['1234', 'staff', 'Слишком простой'],
    ['987654', 'admin', 'Слишком простой'],
  ] as const)('rejects %s for %s', (pin, role, message) => {
    expect(() => checkPin(pin, role)).toThrow(message)
  })

  it('allows PINs that only partly repeat or run', () => {
    expect(() => checkPin('1123', 'staff')).not.toThrow()
    expect(() => checkPin('1357', 'staff')).not.toThrow()
  })
})
