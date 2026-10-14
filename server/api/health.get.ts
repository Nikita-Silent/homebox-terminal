export default defineEventHandler(() => {
  const config = useRuntimeConfig()

  return {
    ok: true,
    homeboxConfigured: Boolean(config.homebox.baseUrl && config.homebox.token),
  }
})
