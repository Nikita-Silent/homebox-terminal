<script setup lang="ts">
import type { OrbState } from 'thinking-orbs/engine'

/** A screen or a list on its way: the orb with what is being fetched, in place of the content. */
withDefaults(defineProps<{ text?: string, state?: OrbState }>(), { text: 'Загружаем…', state: 'working' })
</script>

<template>
  <div
    class="flex min-h-64 flex-col items-center justify-center gap-5 py-8"
    aria-busy="true"
    role="status"
  >
    <OrbLoader
      :state="state"
      :size="112"
      :label="text"
    />
    <p class="t-label text-2xl">
      {{ text }}
    </p>
  </div>
</template>
