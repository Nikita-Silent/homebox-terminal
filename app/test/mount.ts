import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach } from 'vitest'

// Pages listen to the keyboard (scanner, PIN) and cache fetched data: every page mounted in a test
// is unmounted after it, and Nuxt's data cache starts empty for the next one.
const mounted: { unmount: () => void }[] = []

export const mountPage: typeof mountSuspended = async (...args) => {
  const wrapper = await mountSuspended(...args)
  mounted.push(wrapper)
  return wrapper
}

beforeEach(() => clearNuxtData())
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

/** A USB scanner: fast keys and Enter. */
export function scan(code: string) {
  for (const key of code) window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
}

/** Lets fetches, debounced previews and watchers run. */
export async function settle(ms = 300) {
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, ms))
  await flushPromises()
}
