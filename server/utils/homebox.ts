import type { HomeboxClient } from '../homebox/client'
import { createHomeboxClient } from '../homebox/client'
import { TransferError } from '../services/transfers/types'

let client: HomeboxClient | null = null

/** Server-side Homebox client. The API token never leaves the server. */
export function useHomebox(): HomeboxClient {
  if (client) return client
  const { homebox } = useRuntimeConfig()
  if (!homebox.baseUrl || !homebox.token) {
    throw new TransferError('HOMEBOX_UNAVAILABLE', 'Homebox не настроен: задайте NUXT_HOMEBOX_BASE_URL и NUXT_HOMEBOX_TOKEN')
  }
  client = createHomeboxClient({ baseUrl: homebox.baseUrl, token: homebox.token })
  return client
}
