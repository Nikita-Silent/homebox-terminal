<script setup lang="ts">
import type { ItemSummary } from '#shared/types/terminal'
import { ArrowUp } from '@lucide/vue'

const PAGE = 60

const { data: items, error, refresh } = await useFetch<ItemSummary[]>('/api/items/all')
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
// The filter and how far the list was opened survive a visit to an item and a later return.
const filter = useState('browse-all:filter', () => '')
const shown = useState('browse-all:shown', () => PAGE)
const notice = ref<string | null>(null)
useBrowseScanner((message) => {
  notice.value = message
})

const { load: loadTree, pathTo } = useLocationTree()
onMounted(() => loadTree())

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е')

const filtered = computed(() => {
  const words = normalize(filter.value).split(/\s+/).filter(Boolean)
  const all = items.value ?? []
  if (!words.length) return all
  return all.filter((item) => {
    const place = pathTo(item.location?.id) ?? (item.location ? [item.location] : [])
    const hay = normalize(`${item.name} ${item.assetId} ${item.modelNumber} ${pathText(place)}`)
    return words.every(w => hay.includes(w))
  })
})

watch(filter, () => {
  shown.value = PAGE
})

const toTop = () => window.scrollTo({ top: 0 })

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
  nextTick(() => {
    const row = document.getElementById(`item-${filtered.value[index]!.id}`)
    // Just under the sticky filter, not behind it.
    const bar = document.querySelector('[data-sticky-filter]')?.getBoundingClientRect().bottom ?? 0
    if (row) window.scrollBy({ top: row.getBoundingClientRect().top - bar - 12 })
  })
}
</script>

<template>
  <div class="flex flex-col gap-6 short:gap-4">
    <BackLink to="/browse">
      Все склады
    </BackLink>

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

    <LoadingBlock
      v-else-if="!items"
      text="Загружаем список…"
      state="searching"
    />

    <template v-else>
      <!-- The filter and the letters ride under the rail: changing the choice never needs a scroll back up. -->
      <div
        class="sticky top-16 z-20 -mx-4 flex flex-col gap-2 border-b-[3px] border-ink bg-paper px-4 py-2 sm:-mx-8 sm:px-8"
        data-sticky-filter
      >
        <div class="flex gap-2">
          <FilterField
            id="all-filter"
            v-model="filter"
            class="min-w-0 flex-1"
            label="Отфильтровать список"
            placeholder="Название, модель, UID или место"
          />
          <button
            type="button"
            class="frame flex w-16 shrink-0 items-center justify-center bg-paper hover:bg-wash active:bg-ink active:text-paper"
            aria-label="В начало списка"
            @click="toTop"
          >
            <ArrowUp
              class="size-7"
              :stroke-width="2.5"
            />
          </button>
        </div>

        <nav
          v-if="letters.length > 1"
          class="flex gap-2 overflow-x-auto pb-1"
          aria-label="Перейти к букве"
        >
          <button
            v-for="letter in letters"
            :key="letter"
            type="button"
            class="t-label frame h-16 min-w-16 shrink-0 bg-paper px-3 text-2xl hover:bg-wash active:bg-ink active:text-paper"
            @click="jump(letter)"
          >
            {{ letter }}
          </button>
        </nav>
      </div>

      <p class="t-small">
        {{ filtered.length }} из {{ items.length }}
      </p>

      <div class="flex flex-col gap-3">
        <ItemRow
          v-for="item in filtered.slice(0, shown)"
          :id="`item-${item.id}`"
          :key="item.id"
          :item="item"
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
