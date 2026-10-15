import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuthService } from '../services/auth/service'
import { installNitroGlobals } from '../test/nitro'

type Plugin = (nitro?: unknown) => void | Promise<void>

beforeAll(installNitroGlobals)
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function plugin(name: string): Promise<Plugin> {
  vi.resetModules()
  return (await import(`./${name}.ts`)).default as Plugin
}

describe('auth-bootstrap', () => {
  function setup(config: { pin: string, name?: string, years?: number }) {
    vi.useFakeTimers()
    const auth = createAuthService({ path: ':memory:' })
    const purgeJournal = vi.fn(() => 0)
    vi.stubGlobal('useRuntimeConfig', () => ({ admin: { name: config.name ?? 'Администратор', pin: config.pin }, journalRetentionYears: config.years ?? 5 }))
    vi.stubGlobal('useAuthService', () => auth)
    vi.stubGlobal('useTransferService', () => ({ purgeJournal }))
    return { auth, purgeJournal }
  }

  it('creates the first administrator from NUXT_ADMIN_PIN', async () => {
    const { auth } = setup({ pin: '604918', name: 'Главный' })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await (await plugin('auth-bootstrap'))()
    expect(auth.listUsers()).toEqual([expect.objectContaining({ name: 'Главный', role: 'admin', active: true })])
  })

  it('warns instead of failing when there is no admin and no PIN, or a bad PIN', async () => {
    setup({ pin: '' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await (await plugin('auth-bootstrap'))()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('NUXT_ADMIN_PIN'))
    setup({ pin: '1234' })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await (await plugin('auth-bootstrap'))()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('rejected'), expect.stringContaining('от 6 до 8'))
  })

  it('purges the journal on start and then daily, with the configured retention', async () => {
    const { purgeJournal } = setup({ pin: '', years: 3 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await (await plugin('auth-bootstrap'))()
    expect(purgeJournal).toHaveBeenLastCalledWith(3)
    vi.advanceTimersByTime(86_400_000)
    expect(purgeJournal).toHaveBeenCalledTimes(2)
  })
})

describe('transfers-resume', () => {
  it('resumes pending operations shortly after start and every 30 s, one run at a time', async () => {
    vi.useFakeTimers()
    let release: () => void = () => {}
    const resumePending = vi.fn(() => new Promise<{ opId: string, status: string, message: null }[]>((resolve) => {
      release = () => resolve([{ opId: 'op', status: 'done', message: null }])
    }))
    vi.stubGlobal('useTransferService', () => ({ resumePending }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    ;(await plugin('transfers-resume'))()
    expect(resumePending).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(resumePending).toHaveBeenCalledTimes(1)
    // Still running: the interval tick is skipped.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(resumePending).toHaveBeenCalledTimes(1)
    release()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(resumePending).toHaveBeenCalledTimes(2)
    expect(info).toHaveBeenCalledWith('[transfers] resumed op: done')
  })

  it('logs and survives a failing run', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('useTransferService', () => ({ resumePending: () => Promise.reject(new Error('Homebox down')) }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(await plugin('transfers-resume'))()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(warn).toHaveBeenCalledWith('[transfers] resume failed:', 'Homebox down')
  })
})

describe('direction-contract', () => {
  it('puts the design contract first in <body>', async () => {
    let hook: ((html: { bodyPrepend: string[] }) => void) | undefined
    const nitro = { hooks: { hook: (_name: string, fn: typeof hook) => (hook = fn) } }
    ;(await plugin('direction-contract'))(nitro)
    const html = { bodyPrepend: ['<div>app</div>'] }
    hook!(html)
    expect(html.bodyPrepend[0]).toMatch(/^<!--\nTHESIS:/)
    expect(html.bodyPrepend[1]).toBe('<div>app</div>')
  })
})
