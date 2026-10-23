<script setup lang="ts">
import type { ItemSummary } from '#shared/types/terminal'
import { ArrowLeft, Search } from '@lucide/vue'

const PAGE = 60

const { data: items, error, refresh } = await useFetch<ItemSummary[]>('/api/items/all')
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
const filter = ref('')
const shown = ref(PAGE)
const notice = ref<string | null>(null)
useBrowseScanner((message) => {
  notice.value = message
})

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е')

const filtered = computed(() => {
  const words = normalize(filter.value).split(/\s+/).filter(Boolean)
  const all = items.value ?? []
  if (!words.length) return all
  return all.filter((item) => {
    const hay = normalize(`${item.name} ${item.assetId} ${item.modelNumber} ${item.location?.name ?? ''}`)
    return words.every(w => hay.includes(w))
  })
})

watch(filter, () => {
  shown.value = PAGE
})

/**
 * Jump keys: one per Cyrillic first letter; Latin names share «A–Z» (Latin C and Cyrillic С look
 * identical on a button), digits share «0–9», everything else «#».
 */
function letterKey(name: string) {
  const ch = name.trim().charAt(0).toLocaleUpperCase('ru')
  if (/\p{Script=Cyrillic}/u.test(ch)) return ch === 'Ё' ? 'Е' : ch
  if (/[A-Z]/i.test(ch)) return 'A–Z'
  if (/\d/.test(ch)) return '0–9'
  return '#'
}

const letters = computed(() => [...new Set(filtered.value.map(i => letterKey(i.name)))])

function jump(letter: string) {
  const index = filtered.value.findIndex(i => letterKey(i.name) === letter)
  if (index < 0) return
  shown.value = Math.max(shown.value, index + PAGE)
  nextTick(() => document.getElementById(`item-${filtered.value[index]!.id}`)?.scrollIntoView({ block: 'start' }))
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      to="/browse"
      class="t-label flex w-fit items-center gap-2 text-xl hover:underline hover:decoration-[3px] hover:underline-offset-4"
    >
      <ArrowLeft
        class="size-6"
        :stroke-width="2.5"
      />
      Все склады
    </NuxtLink>

    <h1 class="t-label text-4xl sm:text-6xl short:sm:text-5xl">
      Всё оборудование
    </h1>

    <StatusStrip
      v-if="notice"
      kind="info"
      :message="notice"
    />

    <StatusStrip
      v-if="apiError"
      kind="error"
      title="Не удалось загрузить список"
      :message="apiError.message"
    >
      <Button
        variant="outline"
        size="lg"
        class="mt-4"
        @click="refresh()"
      >
        Повторить
      </Button>
    </StatusStrip>

    <div
      v-else-if="!items"
      class="frame hatch-pending h-64"
      aria-busy="true"
    />

    <template v-else>
      <div class="frame flex items-center gap-3 bg-paper px-4">
        <Search
          class="size-6 shrink-0"
          :stroke-width="2.5"
          aria-hidden="true"
        />
        <label
          class="sr-only"
          for="all-filter"
        >Отфильтровать список</label>
        <input
          id="all-filter"
          v-model="filter"
          type="search"
          autocomplete="off"
          placeholder="Название, модель или UID"
          class="h-16 min-w-0 flex-1 bg-transparent text-xl font-semibold placeholder:font-normal placeholder:text-ink-soft focus:outline-none"
        >
      </div>

      <nav
        v-if="letters.length > 1"
        class="flex flex-wrap gap-2"
        aria-label="Перейти к букве"
      >
        <button
          v-for="letter in letters"
          :key="letter"
          type="button"
          class="t-label frame h-14 min-w-14 bg-paper px-3 text-2xl hover:bg-wash active:bg-ink active:text-paper"
          @click="jump(letter)"
        >
          {{ letter }}
        </button>
      </nav>

      <p class="t-small">
        {{ filtered.length }} из {{ items.length }}
      </p>

      <div class="flex flex-col gap-3">
        <ItemRow
          v-for="item in filtered.slice(0, shown)"
          :id="`item-${item.id}`"
          :key="item.id"
          :item="item"
          class="scroll-mt-20"
        />
      </div>

      <Button
        v-if="filtered.length > shown"
        variant="outline"
        size="touch"
        @click="shown += PAGE"
      >
        Показать ещё {{ Math.min(PAGE, filtered.length - shown) }}
      </Button>

      <div
        v-if="!filtered.length"
        class="frame unavailable p-6"
      >
        <p class="t-label text-2xl">
          Ничего не подходит под «{{ filter }}»
        </p>
      </div>
    </template>
  </div>
</template>
