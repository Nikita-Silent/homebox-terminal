/**
 * USB barcode scanners in HID mode type the code as very fast keystrokes ending with Enter.
 * Outside text fields those keystrokes are captured here; inside a field they simply land in it
 * and the field's own submit handles them.
 */
const MAX_GAP_MS = 45
const MIN_LENGTH = 3

export function useScanner(onScan: (code: string) => void) {
  let buffer = ''
  let last = 0

  function isTypingTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
  }

  function onKeydown(event: KeyboardEvent) {
    if (isTypingTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return
    const now = performance.now()
    if (now - last > MAX_GAP_MS) buffer = ''
    last = now

    if (event.key === 'Enter') {
      if (buffer.length >= MIN_LENGTH) {
        event.preventDefault()
        onScan(buffer)
      }
      buffer = ''
      return
    }
    if (event.key.length === 1) buffer += event.key
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
}
