import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearField, eraseIn, isKeyboardField, layoutFor, moveCaret, pressEnter, typeInto } from './touch-keyboard'

afterEach(() => {
  document.body.innerHTML = ''
})

function field(html: string) {
  document.body.innerHTML = html
  return document.body.querySelector('input, textarea') as HTMLInputElement
}

describe('touch keyboard typing', () => {
  it('serves text fields only, and not read-only or opted-out ones', () => {
    expect(isKeyboardField(field('<input type="search">'))).toBe(true)
    expect(isKeyboardField(field('<input>'))).toBe(true)
    expect(isKeyboardField(field('<textarea></textarea>'))).toBe(true)
    expect(isKeyboardField(field('<input type="date">'))).toBe(false)
    expect(isKeyboardField(field('<input type="checkbox">'))).toBe(false)
    expect(isKeyboardField(field('<input readonly>'))).toBe(false)
    expect(isKeyboardField(field('<input disabled>'))).toBe(false)
    expect(isKeyboardField(field('<div data-no-touch-keyboard><input></div>'))).toBe(false)
    expect(isKeyboardField(document.body)).toBe(false)
    expect(isKeyboardField(null)).toBe(false)
  })

  it('gives PIN and quantity fields the digit pad', () => {
    expect(layoutFor(field('<input inputmode="numeric">'))).toBe('digits')
    expect(layoutFor(field('<input inputmode="search">'))).toBe('ru')
    expect(layoutFor(field('<input>'))).toBe('ru')
  })

  it('types at the caret, replaces a selection and reports every change as input', () => {
    const el = field('<input value="кбель">')
    const onInput = vi.fn()
    el.addEventListener('input', onInput)
    el.setSelectionRange(1, 1)
    typeInto(el, 'а')
    expect(el.value).toBe('кабель')
    expect(el.selectionStart).toBe(2)
    el.setSelectionRange(0, 6)
    typeInto(el, 'К')
    expect(el.value).toBe('К')
    expect(onInput).toHaveBeenCalledTimes(2)
  })

  it('keeps to maxlength', () => {
    const el = field('<input maxlength="4" value="1234">')
    el.setSelectionRange(4, 4)
    typeInto(el, '5')
    expect(el.value).toBe('1234')
  })

  it('erases the character before the caret or the selection, and clears the field', () => {
    const el = field('<input value="полка">')
    el.setSelectionRange(5, 5)
    eraseIn(el)
    expect(el.value).toBe('полк')
    el.setSelectionRange(0, 0)
    eraseIn(el)
    expect(el.value).toBe('полк')
    el.setSelectionRange(1, 3)
    eraseIn(el)
    expect(el.value).toBe('пк')
    clearField(el)
    expect(el.value).toBe('')
  })

  it('submits the form on Enter unless the field handles Enter itself', () => {
    const el = field('<form><input value="x"></form>')
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    el.form!.addEventListener('submit', onSubmit)
    pressEnter(el)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    el.addEventListener('keydown', e => e.key === 'Enter' && e.preventDefault())
    pressEnter(el)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('moves the caret by one character, collapsing a selection to its edge first', () => {
    const el = field('<input value="кабль">')
    el.setSelectionRange(4, 4)
    moveCaret(el, -1)
    expect(el.selectionStart).toBe(3)
    typeInto(el, 'е')
    expect(el.value).toBe('кабель')
    el.setSelectionRange(0, 0)
    moveCaret(el, -1)
    expect(el.selectionStart).toBe(0)
    el.setSelectionRange(1, 4)
    moveCaret(el, 1)
    expect([el.selectionStart, el.selectionEnd]).toEqual([4, 4])
  })
})
