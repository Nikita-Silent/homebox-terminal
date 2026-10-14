<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

const props = defineProps<{ max: number }>()
const model = defineModel<number>({ required: true })

const text = ref(String(model.value))
watch(model, (v) => {
  if (Number(text.value) !== v) text.value = String(v)
})

function set(value: number) {
  model.value = Math.min(props.max, Math.max(1, Math.round(value)))
  text.value = String(model.value)
}

function onInput() {
  const n = Number.parseInt(text.value, 10)
  if (Number.isFinite(n)) model.value = Math.min(props.max, Math.max(1, n))
}
</script>

<template>
  <div class="grid gap-3 sm:flex sm:items-stretch">
    <div class="frame flex items-stretch bg-paper">
      <button
        type="button"
        class="flex w-20 items-center justify-center border-r-[3px] border-ink hover:bg-wash active:bg-ink active:text-paper disabled:cursor-not-allowed disabled:text-ink-soft disabled:outline-dashed disabled:outline-[3px] disabled:-outline-offset-[10px] disabled:outline-ink-soft"
        :disabled="model <= 1"
        aria-label="Меньше"
        @click="set(model - 1)"
      >
        <Minus
          class="size-8"
          :stroke-width="3"
        />
      </button>
      <label
        class="sr-only"
        for="quantity"
      >Количество, из {{ max }}</label>
      <input
        id="quantity"
        v-model="text"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        class="t-num h-20 w-full min-w-0 flex-1 bg-transparent text-center text-6xl focus:outline-none sm:w-36 sm:flex-none"
        @input="onInput"
        @blur="set(model)"
        @focus="($event.target as HTMLInputElement).select()"
      >
      <button
        type="button"
        class="flex w-20 items-center justify-center border-l-[3px] border-ink hover:bg-wash active:bg-ink active:text-paper disabled:cursor-not-allowed disabled:text-ink-soft disabled:outline-dashed disabled:outline-[3px] disabled:-outline-offset-[10px] disabled:outline-ink-soft"
        :disabled="model >= max"
        aria-label="Больше"
        @click="set(model + 1)"
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
</template>
