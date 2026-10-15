// Starts a disposable Homebox in Docker and the built terminal against it.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, openSync } from 'node:fs'
import { createApiKey, HOMEBOX_URL } from './homebox'
import { ADMIN, E2E_DIR, STATE_FILE, TERMINAL_URL, compose } from './env'

async function waitFor(url: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    }
    catch {
      // Not up yet.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`${url} did not come up in ${timeoutMs} ms`)
}

export default async function globalSetup() {
  rmSync(E2E_DIR, { recursive: true, force: true })
  mkdirSync(E2E_DIR, { recursive: true })

  execFileSync('docker', [...compose, 'up', '-d', '--force-recreate', '--renew-anon-volumes'], { stdio: 'inherit' })
  await waitFor(`${HOMEBOX_URL}/api/v1/status`, 60_000)
  const token = await createApiKey()

  const log = openSync(`${E2E_DIR}/terminal.log`, 'w')
  const terminal = spawn(process.execPath, ['.output/server/index.mjs'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: new URL(TERMINAL_URL).port,
      NODE_ENV: 'production',
      NUXT_HOMEBOX_BASE_URL: HOMEBOX_URL,
      NUXT_HOMEBOX_TOKEN: token,
      NUXT_JOURNAL_PATH: `${E2E_DIR}/journal.sqlite`,
      NUXT_ADMIN_NAME: ADMIN.name,
      NUXT_ADMIN_PIN: ADMIN.pin,
      NUXT_ALLOWED_HOSTS: new URL(TERMINAL_URL).host,
      NUXT_SESSION_IDLE_MINUTES: '15',
    },
    stdio: ['ignore', log, log],
    detached: true,
  })
  terminal.unref()
  await waitFor(`${TERMINAL_URL}/api/health`, 30_000)

  writeFileSync(STATE_FILE, JSON.stringify({ token, terminalPid: terminal.pid }))
}
