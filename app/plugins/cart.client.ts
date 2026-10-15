import type { CartLine } from '~/composables/useCart'

const key = (userId: string) => `hbt:cart:${userId}`

/**
 * The cart belongs to the signed-in employee: it is loaded on sign-in, hidden on sign-out
 * (the next person must not see it) and waits for the same employee after an idle sign-out.
 */
export default defineNuxtPlugin(() => {
  const { user } = useAuth()
  const { lines } = useCart()

  watch(() => user.value?.id ?? null, (userId) => {
    let saved: CartLine[] = []
    if (userId) {
      try {
        saved = JSON.parse(localStorage.getItem(key(userId)) ?? '[]') as CartLine[]
      }
      catch {
        // Storage unavailable or damaged: start empty.
      }
    }
    lines.value = Array.isArray(saved) ? saved : []
  }, { immediate: true })

  watch(lines, (value) => {
    const userId = user.value?.id
    if (!userId) return
    try {
      if (value.length) localStorage.setItem(key(userId), JSON.stringify(value))
      else localStorage.removeItem(key(userId))
    }
    catch {
      // Private mode or full storage: the cart still works for this page session.
    }
  }, { deep: true })
})
