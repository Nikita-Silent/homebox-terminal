<script setup lang="ts">
import type { ItemSummary } from '#shared/types/terminal'
import { Maximize2, Minus, Plus, X } from '@lucide/vue'

/**
 * The item photo over the whole screen, for reading a marking on the equipment. Two fingers zoom,
 * one finger moves the zoomed photo, a double tap zooms in and back; the keys do the same for a
 * single gloved finger. Only «Закрыть» (or Escape) closes it: a stray touch on the photo never does.
 */
defineProps<{ item: Pick<ItemSummary, 'id' | 'name' | 'hasImage' | 'imageId'> }>()
const emit = defineEmits<{ close: [] }>()

const MIN = 1
const MAX = 6

const stage = ref<HTMLElement | null>(null)
const scale = ref(1)
const x = ref(0)
const y = ref(0)

/** A zoomed photo still covers the stage: it cannot be dragged away into the black. */
function clampPan() {
  const box = stage.value?.getBoundingClientRect()
  if (!box) return
  const maxX = (box.width * (scale.value - 1)) / 2
  const maxY = (box.height * (scale.value - 1)) / 2
  x.value = Math.min(maxX, Math.max(-maxX, x.value))
  y.value = Math.min(maxY, Math.max(-maxY, y.value))
}

/** Zoom keeping the point under the fingers (screen coordinates) where it is. */
function zoomTo(next: number, at?: { x: number, y: number }) {
  const box = stage.value?.getBoundingClientRect()
  const s = Math.min(MAX, Math.max(MIN, next))
  if (box) {
    const px = (at?.x ?? box.left + box.width / 2) - (box.left + box.width / 2)
    const py = (at?.y ?? box.top + box.height / 2) - (box.top + box.height / 2)
    x.value = px - (s / scale.value) * (px - x.value)
    y.value = py - (s / scale.value) * (py - y.value)
  }
  scale.value = s
  if (s === MIN) {
    x.value = 0
    y.value = 0
  }
  clampPan()
}

const reset = () => zoomTo(MIN)

// ── Fingers ────────────────────────────────────────────────────────────────

const pointers = new Map<number, { x: number, y: number }>()
let pinch: { distance: number, scale: number } | null = null
let lastTap = 0

const distance = () => {
  const [a, b] = [...pointers.values()]
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
}
const middle = () => {
  const [a, b] = [...pointers.values()]
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : undefined
}

function onDown(event: PointerEvent) {
  stage.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) pinch = { distance: distance(), scale: scale.value }
  if (pointers.size !== 1) return
  const now = Date.now()
  if (now - lastTap < 300) {
    zoomTo(scale.value > MIN ? MIN : 2.5, { x: event.clientX, y: event.clientY })
    lastTap = 0
  }
  else {
    lastTap = now
  }
}

function onMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && pointers.size === 2) {
    zoomTo((pinch.scale * distance()) / (pinch.distance || 1), middle())
  }
  else if (pointers.size === 1 && scale.value > MIN) {
    x.value += event.clientX - previous.x
    y.value += event.clientY - previous.y
    clampPan()
  }
}

function onUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinch = null
}

function onWheel(event: WheelEvent) {
  zoomTo(scale.value * (event.deltaY < 0 ? 1.2 : 1 / 1.2), { x: event.clientX, y: event.clientY })
}

onKeyStroke('Escape', () => emit('close'))

const keyClass = 't-label flex h-16 min-w-16 items-center justify-center gap-2 border-[3px] border-paper px-4 text-xl hover:bg-paper hover:text-ink active:bg-paper active:text-ink focus-visible:outline-paper disabled:border-dashed disabled:text-paper/50 disabled:hover:bg-ink disabled:hover:text-paper/50'
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex flex-col bg-ink text-paper"
      role="dialog"
      aria-modal="true"
      :aria-label="`Фото: ${item.name}`"
    >
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
        <p class="t-label min-w-0 flex-1 truncate text-2xl">
          {{ item.name }}
        </p>
        <div
          class="flex gap-2"
          role="group"
          aria-label="Масштаб"
        >
          <button
            type="button"
            :class="keyClass"
            aria-label="Уменьшить"
            :disabled="scale <= MIN"
            @click="zoomTo(scale / 1.5)"
          >
            <Minus
              class="size-7"
              :stroke-width="2.5"
            />
          </button>
          <span class="t-num flex w-20 items-center justify-center text-2xl">{{ Math.round(scale * 100) }}%</span>
          <button
            type="button"
            :class="keyClass"
            aria-label="Увеличить"
            :disabled="scale >= MAX"
            @click="zoomTo(scale * 1.5)"
          >
            <Plus
              class="size-7"
              :stroke-width="2.5"
            />
          </button>
          <button
            type="button"
            :class="keyClass"
            :disabled="scale === MIN"
            @click="reset"
          >
            <Maximize2
              class="size-6"
              :stroke-width="2.5"
            />
            <span class="max-sm:sr-only">Целиком</span>
          </button>
        </div>
        <button
          type="button"
          :class="keyClass"
          autofocus
          @click="emit('close')"
        >
          <X
            class="size-6"
            :stroke-width="2.5"
          />
          Закрыть
        </button>
      </div>
      <div
        ref="stage"
        class="relative mx-4 mb-4 min-h-0 flex-1 touch-none overflow-hidden sm:mx-8 sm:mb-8"
        :class="scale > MIN ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'"
        data-photo-stage
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel.prevent="onWheel"
      >
        <ItemPhoto
          :item="item"
          size="full"
          class="pointer-events-none h-full w-full object-contain select-none"
          :style="{ transform: `translate(${x}px, ${y}px) scale(${scale})` }"
          draggable="false"
        />
      </div>
      <p class="t-small px-4 pb-3 text-center sm:px-8">
        Два пальца — увеличить, один — сдвинуть, двойное касание — приблизить
      </p>
    </div>
  </Teleport>
</template>
