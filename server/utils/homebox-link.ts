import type { HomeboxLink } from '../../shared/types/terminal'
import { HomeboxError } from '../homebox/client'

/** Every open terminal asks every 20 s; Homebox is asked at most this often. */
const MAX_AGE_MS = 10_000

let cache: { at: number, value: HomeboxLink } | null = null
let loading: Promise<HomeboxLink> | null = null

async function load(): Promise<HomeboxLink> {
  let value: HomeboxLink = 'ok'
  try {
    await useHomebox().checkAccess()
  }
  catch (error) {
    value = error instanceof HomeboxError && (error.status === 401 || error.status === 403) ? 'unauthorized' : 'unreachable'
  }
  cache = { at: Date.now(), value }
  return value
}

/** Can the terminal work with Homebox right now: reachable and the API key accepted. */
export async function checkHomeboxLink(): Promise<HomeboxLink> {
  const { homebox } = useRuntimeConfig()
  if (!homebox.baseUrl || !homebox.token) return 'not_configured'
  if (cache && Date.now() - cache.at < MAX_AGE_MS) return cache.value
  loading ??= load().finally(() => {
    loading = null
  })
  return loading
}

export function resetHomeboxLink() {
  cache = null
}
