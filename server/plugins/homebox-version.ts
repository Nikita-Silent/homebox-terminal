/**
 * Logs the Homebox version on start and whenever it changes, warning about versions the terminal
 * has not been tested with. Homebox is upgraded separately, so it is re-checked while running.
 */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return
  const { homebox } = useRuntimeConfig()
  if (!homebox.baseUrl || !homebox.token) return

  const check = () => void getHomeboxVersion()
  setTimeout(check, 1_000)
  setInterval(check, VERSION_MAX_AGE_MS).unref()
})
