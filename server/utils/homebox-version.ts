/** Homebox versions the terminal has been checked against (see docs/homebox-api-notes.md). */
export const TESTED_HOMEBOX_VERSIONS = ['0.27.0']

/** Homebox can be upgraded while the terminal runs, so the version is re-read this often. */
export const VERSION_MAX_AGE_MS = 5 * 60_000
/** After a failed read: retry soon, the outage is not the version. */
const FAILED_MAX_AGE_MS = 30_000

export interface HomeboxVersion {
  /** `0.27.0`, or null when Homebox could not be asked. */
  version: string | null
  tested: boolean
}

const UNKNOWN: HomeboxVersion = { version: null, tested: false }

let cache: { at: number, maxAge: number, value: HomeboxVersion } | null = null
let loading: Promise<HomeboxVersion> | null = null
let lastLogged: string | null = null

/** `v0.27.0`, `0.27.0-rc.1` → [0, 27, 0]; null for anything else (`dev`, empty). */
export function parseVersion(raw: string): [number, number, number] | null {
  const m = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function describeVersion(raw: string): HomeboxVersion {
  const parts = parseVersion(raw)
  if (!parts) return UNKNOWN
  const version = parts.join('.')
  return { version, tested: TESTED_HOMEBOX_VERSIONS.includes(version) }
}

function report(value: HomeboxVersion) {
  if (!value.version || value.version === lastLogged) return
  lastLogged = value.version
  if (value.tested) console.info(`[homebox] version ${value.version}`)
  else console.warn(`[homebox] version ${value.version} has not been tested with the terminal (tested: ${TESTED_HOMEBOX_VERSIONS.join(', ')})`)
}

async function load(): Promise<HomeboxVersion> {
  try {
    const status = await useHomebox().getStatus()
    const value = describeVersion(status.build?.version ?? '')
    cache = { at: Date.now(), maxAge: VERSION_MAX_AGE_MS, value }
    report(value)
    return value
  }
  catch (error) {
    console.warn('[homebox] version check failed:', (error as Error).message)
    cache = { at: Date.now(), maxAge: FAILED_MAX_AGE_MS, value: UNKNOWN }
    return UNKNOWN
  }
}

/** The connected Homebox version; never throws. */
export async function getHomeboxVersion(): Promise<HomeboxVersion> {
  if (cache && Date.now() - cache.at < cache.maxAge) return cache.value
  loading ??= load().finally(() => {
    loading = null
  })
  return loading
}

export function resetHomeboxVersion() {
  cache = null
  lastLogged = null
}
