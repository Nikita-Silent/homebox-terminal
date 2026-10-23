<script setup lang="ts">
import { ArrowBigUp, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, Delete, Search, X } from '@lucide/vue'
import { cn } from '~/lib/utils'
import type { KeyboardField, KeyboardLayout } from '~/utils/touch-keyboard'
import { moveCaret } from '~/utils/touch-keyboard'

/**
 * On-screen keyboard for the touch terminal. Opens when a text field is tapped (or clicked) and
 * types into it; hides on Enter, «Скрыть», leaving the field, a new page, or as soon as a real
 * keyboard or the scanner types. On tablets it replaces the system keyboard (`inputmode=none`).
 */

const field = shallowRef<KeyboardField | null>(null)
/** The panel waits for the tap to finish, see `show`. */
const shown = ref(false)
/** Bars fixed to the bottom edge (ConfirmBar) step aside while the keyboard is up. */
const keyboardOpen = useState('touch-keyboard:open', () => false)
watch(shown, (value) => {
  keyboardOpen.value = value
})
const layout = ref<KeyboardLayout>('ru')
const shift = ref(false)
const panel = ref<HTMLElement | null>(null)
const height = ref(0)
let savedInputMode: string | null = null
let showTimer: ReturnType<typeof setTimeout> | undefined

const letters = computed(() => {
  const rows = LETTERS[layout.value === 'en' ? 'en' : 'ru']
  return shift.value ? rows.map(row => row.map(k => k.toLocaleUpperCase('ru'))) : rows
})
const enterLabel = computed(() => field.value?.getAttribute('enterkeyhint') === 'search' ? 'Найти' : 'Готово')

function open(el: KeyboardField) {
  if (field.value === el) return
  close()
  layout.value = layoutFor(el)
  shift.value = false
  savedInputMode = el.getAttribute('inputmode')
  // Set before the tap focuses the field, so a tablet does not raise its own keyboard as well.
  el.setAttribute('inputmode', 'none')
  field.value = el
  // A long press may never end in a click.
  showTimer = setTimeout(show, 500)
}

/**
 * The panel appears once the opening tap has ended in its click. Shown earlier, it moves the page
 * under the finger, and the click lands on whatever slid there: a key, or another shelf.
 */
function show() {
  clearTimeout(showTimer)
  if (field.value) shown.value = true
}

function onClick(event: MouseEvent) {
  if (field.value && event.target === field.value) show()
}

function close({ blur = false } = {}) {
  const el = field.value
  if (!el) return
  field.value = null
  shown.value = false
  clearTimeout(showTimer)
  if (savedInputMode === null) el.removeAttribute('inputmode')
  else el.setAttribute('inputmode', savedInputMode)
  savedInputMode = null
  if (blur) el.blur()
}

/** The field is still on the page; a re-render or a new screen may have removed it. */
function current() {
  if (field.value && !field.value.isConnected) close()
  return field.value
}

function press(key: string) {
  const el = current()
  if (!el) return
  typeInto(el, key)
  shift.value = false
}

function erase() {
  const el = current()
  if (el) eraseIn(el)
}

function clear() {
  const el = current()
  if (el) clearField(el)
}

function caret(by: -1 | 1) {
  const el = current()
  if (el) moveCaret(el, by)
}

function enter() {
  const el = current()
  if (!el) return
  close({ blur: true })
  pressEnter(el)
}

function onPointerDown(event: PointerEvent) {
  if (isKeyboardField(event.target)) open(event.target)
}

function onFocusIn(event: FocusEvent) {
  if (field.value && event.target !== field.value) close()
}

function onFocusOut(event: FocusEvent) {
  if (event.target !== field.value) return
  if (event.relatedTarget instanceof Node && panel.value?.contains(event.relatedTarget)) return
  close()
}

/** A real keyboard or the scanner is typing: the on-screen one is in the way. */
function onKeyDown(event: KeyboardEvent) {
  if (!field.value || !event.isTrusted) return
  if (event.key === 'Escape') close({ blur: true })
  else if (event.target === field.value && (event.key.length === 1 || event.key === 'Backspace')) close()
}

const router = useRouter()
let stopRouter: (() => void) | undefined
let observer: ResizeObserver | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('click', onClick)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  window.addEventListener('keydown', onKeyDown, true)
  // A new screen, not a new query: live search rewrites `?q=` while the employee is still typing.
  stopRouter = router.afterEach((to, from) => to.path !== from.path && close())
})

onBeforeUnmount(() => {
  close()
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('click', onClick)
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
  window.removeEventListener('keydown', onKeyDown, true)
  stopRouter?.()
  observer?.disconnect()
})

/** A search or filter field: what it finds appears below it and must stay in view while typing. */
function filtersBelow(el: KeyboardField) {
  return el.type === 'search' || el.getAttribute('enterkeyhint') === 'search'
}

// Room below the page so the keyboard never covers the field being typed into. A covered field,
// and any search field, goes up to just under the rail (or a sticky bar it sits under), leaving the
// most room for the results below it.
watch(panel, (el) => {
  observer?.disconnect()
  height.value = 0
  if (!el) return
  observer = new ResizeObserver(() => {
    height.value = el.offsetHeight
    const input = field.value
    const target = input?.getBoundingClientRect()
    const top = el.getBoundingClientRect().top
    if (!input || !target) return
    // A field in a sticky bar is already where it can be.
    if (input.closest('[data-sticky-filter]')) return
    if (target.bottom <= top - 16 && !filtersBelow(input)) return
    const rail = document.querySelector('[data-app-rail]')?.getBoundingClientRect().bottom ?? 0
    const lift = target.top - rail - 16
    if (Math.abs(lift) > 8) window.scrollBy({ top: lift })
  })
  observer.observe(el)
})

const keyClass = 'frame flex h-16 short:h-[64px] min-w-0 flex-1 items-center justify-center bg-paper select-none hover:bg-wash active:bg-ink active:text-paper'
/** On a wide screen the digits stand to the right as a pad: one row less of height. */
const NUMPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0']
/** Enter and a held Shift: inverted, like the primary button. */
const inkKey = 'bg-ink text-paper hover:bg-ink-soft active:bg-paper active:text-ink'
</script>

<template>
  <div
    v-if="field && shown"
    aria-hidden="true"
    :style="{ height: `${height}px` }"
  />
  <div
    v-if="field && shown"
    ref="panel"
    class="fixed inset-x-0 bottom-0 z-50 border-t-[3px] border-ink bg-paper px-2 py-3 sm:px-4 short:py-2"
    role="group"
    aria-label="Экранная клавиатура"
    @pointerdown.prevent
    @mousedown.prevent
  >
    <div
      v-if="layout === 'digits'"
      class="mx-auto grid max-w-md grid-cols-3 gap-2"
    >
      <button
        v-for="key in DIGITS.slice(0, 9)"
        :key="key"
        type="button"
        :class="[keyClass, 't-num text-4xl']"
        @click="press(key)"
      >
        {{ key }}
      </button>
      <button
        type="button"
        :class="keyClass"
        aria-label="Стереть"
        @click="erase"
      >
        <Delete
          class="size-8"
          :stroke-width="2.5"
        />
      </button>
      <button
        type="button"
        :class="[keyClass, 't-num text-4xl']"
        @click="press('0')"
      >
        0
      </button>
      <button
        type="button"
        :class="cn(keyClass, inkKey, 't-label gap-2 text-xl')"
        @click="enter"
      >
        <CornerDownLeft
          class="size-6"
          :stroke-width="2.5"
        />
        {{ enterLabel }}
      </button>
      <button
        type="button"
        :class="[keyClass, 't-label col-span-3 gap-2 text-xl']"
        @click="close({ blur: true })"
      >
        <ChevronDown
          class="size-6"
          :stroke-width="2.5"
        />
        Скрыть клавиатуру
      </button>
    </div>

    <div
      v-else
      class="mx-auto flex max-w-[1280px] gap-1 sm:gap-2 xl:gap-5"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1 sm:gap-2">
        <div class="flex gap-1 sm:gap-2 xl:hidden">
          <button
            v-for="key in [...DIGITS, '-']"
            :key="key"
            type="button"
            :class="[keyClass, 't-num text-2xl sm:text-3xl']"
            @click="press(key)"
          >
            {{ key }}
          </button>
          <button
            type="button"
            :class="[keyClass, 'flex-[1.5]']"
            aria-label="Стереть"
            @click="erase"
          >
            <Delete
              class="size-8"
              :stroke-width="2.5"
            />
          </button>
        </div>
        <div
          v-for="(row, i) in letters"
          :key="i"
          class="flex gap-1 sm:gap-2"
        >
          <button
            v-for="key in row"
            :key="key"
            type="button"
            :class="[keyClass, 'text-2xl font-semibold sm:text-3xl']"
            @click="press(key)"
          >
            {{ key }}
          </button>
        </div>
        <div class="flex gap-1 sm:gap-2">
          <button
            type="button"
            :class="cn(keyClass, shift && inkKey)"
            :aria-pressed="shift"
            aria-label="Заглавная буква"
            @click="shift = !shift"
          >
            <ArrowBigUp
              class="size-8"
              :stroke-width="2.5"
            />
          </button>
          <button
            type="button"
            :class="[keyClass, 't-label text-lg sm:text-xl']"
            @click="layout = layout === 'ru' ? 'en' : 'ru'"
          >
            {{ layout === 'ru' ? 'ENG' : 'РУС' }}
          </button>
          <button
            type="button"
            :class="keyClass"
            aria-label="Курсор влево"
            @click="caret(-1)"
          >
            <ChevronLeft
              class="size-8"
              :stroke-width="3"
            />
          </button>
          <button
            type="button"
            :class="[keyClass, 't-label flex-[3] text-xl']"
            @click="press(' ')"
          >
            Пробел
          </button>
          <button
            type="button"
            :class="keyClass"
            aria-label="Курсор вправо"
            @click="caret(1)"
          >
            <ChevronRight
              class="size-8"
              :stroke-width="3"
            />
          </button>
          <button
            type="button"
            :class="[keyClass, 't-label flex-[1.5] gap-2 text-lg sm:text-xl']"
            @click="clear"
          >
            <X
              class="size-6 max-sm:hidden"
              :stroke-width="2.5"
            />
            Всё
          </button>
          <button
            type="button"
            :class="[keyClass, 't-label flex-[1.5] gap-2 text-lg sm:text-xl']"
            aria-label="Скрыть клавиатуру"
            @click="close({ blur: true })"
          >
            <ChevronDown
              class="size-6"
              :stroke-width="2.5"
            />
            <span class="max-sm:sr-only">Скрыть</span>
          </button>
          <button
            type="button"
            :class="cn(keyClass, inkKey, 't-label flex-[2] gap-2 text-lg sm:text-xl')"
            @click="enter"
          >
            <component
              :is="enterLabel === 'Найти' ? Search : CornerDownLeft"
              class="size-6 max-sm:hidden"
              :stroke-width="2.5"
            />
            {{ enterLabel }}
          </button>
        </div>
      </div>
      <div
        class="hidden w-64 shrink-0 grid-cols-3 gap-2 xl:grid"
        role="group"
        aria-label="Цифры"
      >
        <button
          v-for="key in NUMPAD"
          :key="key"
          type="button"
          :class="[keyClass, 't-num text-3xl']"
          @click="press(key)"
        >
          {{ key }}
        </button>
        <button
          type="button"
          :class="keyClass"
          aria-label="Стереть"
          @click="erase"
        >
          <Delete
            class="size-8"
            :stroke-width="2.5"
          />
        </button>
      </div>
    </div>
  </div>
</template>
