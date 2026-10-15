<script setup lang="ts">
import { ChevronRight, Warehouse } from '@lucide/vue'

defineProps<{ to: string, name: string, hint?: string }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="frame group flex min-h-20 items-center gap-4 bg-paper px-5 py-3 hover:bg-wash active:bg-ink active:text-paper"
  >
    <Warehouse
      class="size-7 shrink-0"
      :stroke-width="2.5"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">
      <span class="t-label block text-2xl break-words sm:text-3xl">{{ name }}</span>
      <span
        v-if="hint"
        class="text-ink-soft group-active:text-paper block text-base font-medium"
      >{{ hint }}</span>
    </span>
    <ChevronRight
      class="size-8 shrink-0"
      :stroke-width="3"
      aria-hidden="true"
    />
  </NuxtLink>
</template>
