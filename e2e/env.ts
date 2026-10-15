import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const E2E_DIR = resolve('.cache/e2e')
export const STATE_FILE = `${E2E_DIR}/state.json`
export const TERMINAL_URL = 'http://127.0.0.1:3200'
export const ADMIN = { name: 'Администратор', pin: '604918' }
export const compose = ['compose', '-p', 'homebox-terminal-e2e', '-f', 'docker-compose.e2e.yml']

export function state(): { token: string } {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
}
