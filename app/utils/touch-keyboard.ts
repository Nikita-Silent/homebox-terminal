/**
 * Typing for the on-screen keyboard. The terminal has no keyboard of its own, and the system one
 * stays hidden because the USB scanner counts as a connected keyboard. Changes go through the
 * field's own value and an `input` event, so v-model and filters react as to real typing.
 */

export type KeyboardField = HTMLInputElement | HTMLTextAreaElement
export type KeyboardLayout = 'ru' | 'en' | 'digits'

const TEXT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password'])

/** Text fields the keyboard serves; dates, checkboxes and opted-out fields keep their own UI. */
export function isKeyboardField(el: EventTarget | null): el is KeyboardField {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  if (el.disabled || el.readOnly || el.closest('[data-no-touch-keyboard]')) return false
  return el instanceof HTMLTextAreaElement || TEXT_TYPES.has(el.type)
}

/** Digits for PINs and quantities, the Russian letters for everything else. */
export function layoutFor(el: KeyboardField): KeyboardLayout {
  const mode = el.getAttribute('inputmode')
  return mode === 'numeric' || mode === 'decimal' || mode === 'tel' ? 'digits' : 'ru'
}

function selection(el: KeyboardField): [number, number] {
  // Some input types (email) do not expose a selection: type at the end.
  const end = el.value.length
  try {
    return [el.selectionStart ?? end, el.selectionEnd ?? end]
  }
  catch {
    return [end, end]
  }
}

function replace(el: KeyboardField, start: number, end: number, text: string) {
  const value = el.value.slice(0, start) + text + el.value.slice(end)
  if (el.maxLength > 0 && value.length > el.maxLength) return
  el.value = value
  try {
    el.setSelectionRange(start + text.length, start + text.length)
  }
  catch {
    // No selection API for this type; the caret stays at the end.
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

export function typeInto(el: KeyboardField, text: string) {
  const [start, end] = selection(el)
  replace(el, start, end, text)
}

/** Backspace: the selection, or the character before the caret. */
export function eraseIn(el: KeyboardField) {
  const [start, end] = selection(el)
  if (start !== end) replace(el, start, end, '')
  else if (start > 0) replace(el, start - 1, start, '')
}

export function clearField(el: KeyboardField) {
  if (el.value) replace(el, 0, el.value.length, '')
}

/** Enter: the field's own Enter handler, else its form's submit. */
export function pressEnter(el: KeyboardField) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
  const handled = !el.dispatchEvent(event)
  if (!handled && el instanceof HTMLInputElement && el.form) el.form.requestSubmit()
}

export const LETTERS: Record<'ru' | 'en', string[][]> = {
  ru: [
    ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
    ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
    ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё'],
  ],
  en: [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '/'],
  ],
}

export const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
