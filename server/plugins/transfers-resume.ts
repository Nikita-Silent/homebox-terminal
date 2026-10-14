const RESUME_INTERVAL_MS = 30_000

/** Finishes transfers interrupted by a restart or a Homebox outage. */
export default defineNitroPlugin(() => {
  if (import.meta.prerender) return

  let running = false
  async function resume() {
    if (running) return
    running = true
    try {
      const results = await useTransferService().resumePending()
      for (const r of results) console.info(`[transfers] resumed ${r.opId}: ${r.status}${r.message ? ` — ${r.message}` : ''}`)
    }
    catch (error) {
      console.warn('[transfers] resume failed:', (error as Error).message)
    }
    finally {
      running = false
    }
  }

  setTimeout(resume, 1_000)
  setInterval(resume, RESUME_INTERVAL_MS).unref()
})
