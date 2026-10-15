import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { STATE_FILE, compose } from './env'

export default async function globalTeardown() {
  if (existsSync(STATE_FILE)) {
    const { terminalPid } = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { terminalPid?: number }
    try {
      if (terminalPid) process.kill(terminalPid)
    }
    catch {
      // Already gone.
    }
  }
  if (!process.env.E2E_KEEP_HOMEBOX) execFileSync('docker', [...compose, 'down', '-v'], { stdio: 'inherit' })
}
