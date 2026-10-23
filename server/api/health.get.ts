import type { HealthStatus } from '../../shared/types/terminal'

/** Public: the Homebox status pill polls it on every screen, the sign-in screen included. */
export default defineEventHandler(async (): Promise<HealthStatus> => {
  const homebox = await checkHomeboxLink()
  const { version, tested } = homebox === 'ok' || homebox === 'unauthorized'
    ? await getHomeboxVersion()
    : { version: null, tested: false }

  return { ok: true, homebox, homeboxConfigured: homebox !== 'not_configured', homeboxVersion: version, homeboxTested: tested }
})
