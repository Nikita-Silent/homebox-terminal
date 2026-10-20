export default defineEventHandler(async () => {
  const config = useRuntimeConfig()
  const homeboxConfigured = Boolean(config.homebox.baseUrl && config.homebox.token)
  const { version, tested } = homeboxConfigured
    ? await getHomeboxVersion()
    : { version: null, tested: false }

  return {
    ok: true,
    homeboxConfigured,
    /** `0.27.0`, or null when Homebox is not configured or did not answer. */
    homeboxVersion: version,
    /** False for a version the terminal has not been checked against: look before trusting it. */
    homeboxTested: tested,
  }
})
