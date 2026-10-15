/** Scanner while browsing: an item label opens its card, a location label opens that location. */
export function useBrowseScanner(onUnknown: (message: string) => void) {
  useScanner(async (code) => {
    try {
      const found = await lookupCode(code)
      if (found.location) await navigateTo(`/browse/${found.location.id}`)
      else if (found.items.length === 1) await navigateTo(`/item/${found.items[0]!.id}`)
      else await navigateTo({ path: '/', query: { q: code } })
    }
    catch (e) {
      onUnknown(toApiError(e).message)
    }
  })
}
