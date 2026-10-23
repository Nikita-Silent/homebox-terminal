<script setup lang="ts">
import { Search, X } from '@lucide/vue'

/** A framed search field with a full-size clear key: no aiming at a tiny cross with a glove. */
defineProps<{ id: string, label: string, placeholder?: string }>()
const model = defineModel<string>({ required: true })
const input = ref<HTMLInputElement | null>(null)

function clear() {
  model.value = ''
  input.value?.focus()
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="frame flex items-stretch bg-paper">
    <Search
      class="mx-4 size-6 shrink-0 self-center"
      :stroke-width="2.5"
      aria-hidden="true"
    />
    <label
      class="sr-only"
      :for="id"
    >{{ label }}</label>
    <input
      :id="id"
      ref="input"
      v-model="model"
      type="search"
      autocomplete="off"
      :placeholder="placeholder ?? label"
      class="h-16 min-w-0 flex-1 bg-transparent text-xl font-semibold placeholder:font-normal placeholder:text-ink-soft focus:outline-none"
    >
    <button
      v-if="model"
      type="button"
      class="flex w-16 shrink-0 items-center justify-center border-l-[3px] border-ink hover:bg-wash active:bg-ink active:text-paper"
      :aria-label="`Очистить: ${label}`"
      @click="clear"
    >
      <X
        class="size-7"
        :stroke-width="2.5"
      />
    </button>
  </div>
</template>
