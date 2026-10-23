<script setup lang="ts">
import type { ItemSummary } from '#shared/types/terminal'

/** `place: false` inside a location's own list, where every row lies in the same place. */
const props = withDefaults(defineProps<{ item: ItemSummary, place?: boolean }>(), { place: true })

const { load, pathTo } = useLocationTree()
onMounted(() => {
  if (props.place) load()
})

/** «Полка 01» repeats in every warehouse: the row names the warehouse and the room too. */
const parents = computed(() => pathTo(props.item.location?.id)?.slice(0, -1) ?? [])
</script>

<template>
  <NuxtLink
    :to="`/item/${item.id}`"
    class="frame group flex items-stretch bg-paper hover:bg-wash active:bg-ink active:text-paper"
  >
    <ItemPhoto
      :item="item"
      decorative
      class="w-16 shrink-0 self-stretch border-r-[3px] border-ink bg-wash object-cover sm:w-28"
    />
    <span class="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4 sm:gap-x-6 sm:px-5">
      <span class="t-label text-2xl break-words sm:text-3xl">{{ item.name }}</span>
      <span class="t-num row-span-2 text-right text-4xl whitespace-nowrap sm:text-5xl">
        {{ item.quantity }}<span class="t-small ml-1 align-top">шт</span>
      </span>
      <span class="text-ink-soft group-active:text-paper flex flex-col gap-1 text-base font-medium">
        <span
          v-if="place && item.location"
          class="text-ink group-active:text-paper text-lg font-semibold"
          data-place
        >
          <template v-if="parents.length">{{ pathText(parents) }} / </template><span class="t-label text-xl">{{ item.location.name }}</span>
        </span>
        <span
          v-if="item.assetId || item.modelNumber"
          class="flex flex-wrap gap-x-4"
        >
          <span v-if="item.assetId">UID {{ item.assetId }}</span>
          <span v-if="item.modelNumber">{{ item.modelNumber }}</span>
        </span>
      </span>
    </span>
  </NuxtLink>
</template>
