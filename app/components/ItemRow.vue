<script setup lang="ts">
import type { ItemSummary } from '#shared/types/terminal'

defineProps<{ item: ItemSummary }>()
</script>

<template>
  <NuxtLink
    :to="`/item/${item.id}`"
    class="frame group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 bg-paper px-5 py-4 hover:bg-wash active:bg-ink active:text-paper"
  >
    <span class="t-label text-2xl break-words sm:text-3xl">{{ item.name }}</span>
    <span class="t-num row-span-2 text-right text-5xl">
      {{ item.quantity }}<span class="t-small ml-1 align-top">шт</span>
    </span>
    <span class="text-ink-soft group-active:text-paper flex flex-wrap gap-x-4 text-base font-medium">
      <span v-if="item.assetId">UID {{ item.assetId }}</span>
      <span v-if="item.modelNumber">{{ item.modelNumber }}</span>
      <span v-if="item.location">{{ item.location.name }}</span>
    </span>
  </NuxtLink>
</template>
