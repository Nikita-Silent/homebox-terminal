import type { LocationRef } from '#shared/types/terminal'

const KEY = 'hbt:recent-locations'
const LIMIT = 6

export interface RecentLocation extends LocationRef {
  path: string
}

/** Per-terminal convenience: the shelves this terminal moved things to last. */
export function useRecentLocations() {
  const recent = useState<RecentLocation[]>('recent-locations', () => [])

  onMounted(() => {
    try {
      recent.value = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecentLocation[]
    }
    catch {
      recent.value = []
    }
  })

  function remember(location: RecentLocation) {
    recent.value = [location, ...recent.value.filter(l => l.id !== location.id)].slice(0, LIMIT)
    try {
      localStorage.setItem(KEY, JSON.stringify(recent.value))
    }
    catch {
      // Storage unavailable (private mode, kiosk policy): keep the in-memory list only.
    }
  }

  return { recent, remember }
}
