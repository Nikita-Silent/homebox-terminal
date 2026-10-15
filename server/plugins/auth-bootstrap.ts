const DAY_MS = 86_400_000

/**
 * Creates the first administrator from NUXT_ADMIN_NAME / NUXT_ADMIN_PIN when there is none,
 * and once a day forgets expired sessions and journal records past the retention period.
 */
export default defineNitroPlugin(async () => {
  if (import.meta.prerender) return
  const { admin, journalRetentionYears } = useRuntimeConfig()
  const auth = useAuthService()

  if (admin.pin) {
    try {
      const outcome = await auth.ensureAdmin(String(admin.name || 'Администратор'), String(admin.pin))
      if (outcome !== 'exists') console.info(`[auth] administrator «${admin.name}» ${outcome} from NUXT_ADMIN_PIN`)
    }
    catch (error) {
      console.error('[auth] NUXT_ADMIN_PIN rejected:', (error as Error).message)
    }
  }
  else if (!auth.listUsers().some(u => u.role === 'admin' && u.active)) {
    console.warn('[auth] no administrator: set NUXT_ADMIN_PIN (6–8 digits) and restart')
  }

  function housekeeping() {
    try {
      auth.purgeSessions()
      const years = Number(journalRetentionYears)
      const removed = useTransferService().purgeJournal(Number.isFinite(years) ? years : 5)
      if (removed) console.info(`[journal] removed ${removed} records older than ${years} years`)
    }
    catch (error) {
      console.warn('[journal] housekeeping failed:', (error as Error).message)
    }
  }
  housekeeping()
  setInterval(housekeeping, DAY_MS).unref()
})
