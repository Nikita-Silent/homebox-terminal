import { TransferError } from '../services/transfers/types'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Request guards for the API, which acts with the terminal's Homebox token:
 * - Host allowlist (NUXT_ALLOWED_HOSTS) against DNS rebinding from a page on the internet.
 * - Writes accept only JSON from the terminal's own origin. A cross-site form or
 *   `no-cors` fetch cannot send `application/json`, and a CORS preflight is never answered.
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return

  const allowed = allowedHosts()
  const host = (getRequestHeader(event, 'host') ?? '').toLowerCase()
  if (allowed.size && !allowed.has(host) && !allowed.has(host.replace(/:\d+$/, ''))) {
    throw toHttpError(new TransferError('VALIDATION', `Хост «${host}» не разрешён (NUXT_ALLOWED_HOSTS)`))
  }

  if (SAFE_METHODS.has(event.method)) return

  const type = getRequestHeader(event, 'content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json')) {
    throw toHttpError(new TransferError('VALIDATION', 'Ожидается JSON'))
  }
  const origin = getRequestHeader(event, 'origin')
  if (origin) {
    let originHost = ''
    try {
      originHost = new URL(origin).host.toLowerCase()
    }
    catch {
      // Opaque origin ("null") — never ours.
    }
    if (originHost !== host) throw toHttpError(new TransferError('VALIDATION', 'Запрос с чужого сайта отклонён'))
  }
})

let cached: { raw: string, hosts: Set<string> } | null = null
function allowedHosts(): Set<string> {
  const raw = useRuntimeConfig().allowedHosts
  if (cached?.raw !== raw) {
    cached = { raw, hosts: new Set(raw.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)) }
  }
  return cached.hosts
}
