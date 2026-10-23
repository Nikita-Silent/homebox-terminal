<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

const props = defineProps<{ max: number }>()
const model = defineModel<number>({ required: true })

// Several steppers share the cart screen.
const fieldId = useId()
const text = ref(String(model.value))
/** Shown when a typed number was more than there is: the field never silently says something else. */
const capped = ref(false)
watch(model, (v) => {
  if (Number(text.value) !== v) text.value = String(v)
})

function set(value: number) {
  capped.value = false
  model.value = Math.min(props.max, Math.max(1, Math.round(value)))
  text.value = String(model.value)
}

function onInput() {
  const n = Number.parseInt(text.value, 10)
  if (!Number.isFinite(n)) return
  capped.value = n > props.max
  model.value = Math.min(props.max, Math.max(1, n))
  // The field shows what will be moved, at once, not after it loses focus.
  if (capped.value) text.value = String(model.value)
}

// ── Holding a key repeats it, faster the longer it is held ────────────────

let holdTimer: ReturnType<typeof setTimeout> | undefined
let held = 0

function step(direction: 1 | -1) {
  // 1 at a time for the first second, then 5, then 10.
  const by = held < 8 ? 1 : held < 20 ? 5 : 10
  const next = direction > 0 ? model.value + by : model.value - by
  // Bigger steps land on round numbers: 37 → 40 → 45, not 37 → 42.
  set(by > 1 ? (direction > 0 ? Math.floor(next / by) * by : Math.ceil(next / by) * by) : next)
}

function startHold(direction: 1 | -1, event: PointerEvent) {
  if (event.button !== 0) return
  stopHold()
  held = 0
  step(direction)
  const repeat = () => {
    held++
    step(direction)
    if ((direction > 0 && model.value < props.max) || (direction < 0 && model.value > 1)) holdTimer = setTimeout(repeat, 110)
  }
  holdTimer = setTimeout(repeat, 450)
}

function stopHold() {
  clearTimeout(holdTimer)
  holdTimer = undefined
}

/** Keyboard activation (Enter, Space) arrives as a click with no pointer: one step. */
function onKeyClick(direction: 1 | -1, event: MouseEvent) {
  if (event.detail === 0) set(model.value + direction)
}

onBeforeUnmount(stopHold)

const stepClass = 'flex w-20 touch-none items-center justify-center hover:bg-wash active:bg-ink active:text-paper disabled:cursor-not-allowed disabled:text-ink-soft disabled:outline-dashed disabled:outline-[3px] disabled:-outline-offset-[10px] disabled:outline-ink-soft'
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="grid gap-3 sm:flex sm:items-stretch">
      <div class="frame flex items-stretch bg-paper">
        <button
          type="button"
          :class="[stepClass, 'border-r-[3px] border-ink']"
          :disabled="model <= 1"
          aria-label="Меньше"
          @pointerdown="startHold(-1, $event)"
          @pointerup="stopHold"
          @pointerleave="stopHold"
          @pointercancel="stopHold"
          @click="onKeyClick(-1, $event)"
          @contextmenu.prevent
        >
          <Minus
            class="size-8"
            :stroke-width="3"
          />
        </button>
        <label
          class="sr-only"
          :for="fieldId"
        >Количество, из {{ max }}</label>
        <input
          :id="fieldId"
          v-model="text"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          class="t-num h-20 w-full min-w-0 flex-1 bg-transparent text-center text-6xl focus:outline-none sm:w-36 sm:flex-none"
          :aria-describedby="capped ? `${fieldId}-capped` : undefined"
          @input="onInput"
          @blur="set(model)"
          @focus="($event.target as HTMLInputElement).select()"
        >
        <button
          type="button"
          :class="[stepClass, 'border-l-[3px] border-ink']"
          :disabled="model >= max"
          aria-label="Больше"
          @pointerdown="startHold(1, $event)"
          @pointerup="stopHold"
          @pointerleave="stopHold"
          @pointercancel="stopHold"
          @click="onKeyClick(1, $event)"
          @contextmenu.prevent
        >
          <Plus
            class="size-8"
            :stroke-width="3"
          />
        </button>
      </div>
      <Button
        type="button"
        size="touch"
        class="h-auto min-h-20"
        :variant="model === max ? 'default' : 'outline'"
        @click="set(max)"
      >
        Все {{ max }} шт.
      </Button>
    </div>
    <p
      v-if="capped"
      :id="`${fieldId}-capped`"
      class="hatch-attention w-fit border-[3px] border-ink p-1.5"
      role="status"
    >
      <span class="inline-block bg-paper px-2 py-1 text-lg font-semibold">Больше нет: здесь всего {{ max }} шт.</span>
    </p>
    <p
      v-else-if="max > 10"
      class="text-base text-ink-soft"
    >
      Удерживайте − или +, чтобы менять быстрее.
    </p>
  </div>
</template>
