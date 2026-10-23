<script setup lang="ts">
import type { LocationNode } from '#shared/types/terminal'
import { List } from '@lucide/vue'

const { data: tree, error, refresh } = await useFetch<LocationNode[]>('/api/locations/tree')
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
const notice = ref<string | null>(null)
useBrowseScanner((message) => {
  notice.value = message
})

// Typed filter survives a visit to a shelf and back.
const filter = useState('browse:filter', () => '')

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ru', { numeric: true })
const roots = computed(() => [...(tree.value ?? [])].sort(byName))

interface Place { id: string, name: string, parents: string, inside: number }

/** Every place at every depth: a shelf can be reached from here without opening its warehouse. */
const everywhere = computed(() => {
  const rows: Place[] = []
  const walk = (nodes: LocationNode[], parents: string[]) => {
    for (const node of nodes) {
      rows.push({ id: node.id, name: node.name, parents: parents.join(' / '), inside: node.children.length })
      walk(node.children, [...parents, node.name])
    }
  }
  walk(tree.value ?? [], [])
  return rows
})

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е')
const matches = computed(() => {
  const words = normalize(filter.value).split(/\s+/).filter(Boolean)
  if (!words.length) return null
  return everywhere.value
    .filter(place => words.every(w => normalize(`${place.parents} ${place.name}`).includes(w)))
    // Warehouses and rooms before the shelves inside them.
    .sort((a, b) => a.parents.split(' / ').length - b.parents.split(' / ').length || byName(a, b))
})
</script>

<template>
  <div class="flex flex-col gap-6 short:gap-4">
    <BackLink to="/">
      К поиску
    </BackLink>

    <h1 class="t-label text-4xl sm:text-6xl short:sm:text-5xl">
      Выберите, где искать
    </h1>
    <p class="-mt-3 text-lg">
      Откройте склад и полку — там будет список оборудования. Можно отсканировать этикетку полки.
    </p>

    <StatusStrip
      v-if="notice"
      kind="info"
      :message="notice"
    />

    <Button
      as-child
      size="touch"
      class="h-20 justify-start text-2xl"
    >
      <NuxtLink to="/browse/all">
        <List />
        Всё оборудование по алфавиту
      </NuxtLink>
    </Button>

    <StatusStrip
      v-if="apiError"
      kind="error"
      title="Не удалось загрузить склады"
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
      v-else-if="!tree"
      text="Загружаем склады…"
    />

    <template v-else>
      <FilterField
        id="browse-filter"
        v-model="filter"
        label="Найти склад, помещение или полку"
      />

      <nav
        v-if="matches"
        class="grid gap-3 md:grid-cols-2"
        aria-label="Найденные места"
      >
        <LocationRow
          v-for="place in matches"
          :key="place.id"
          :to="`/browse/${place.id}`"
          :name="place.name"
          :hint="[place.parents, place.inside ? `внутри: ${place.inside}` : ''].filter(Boolean).join(' · ') || undefined"
        />
        <div
          v-if="!matches.length"
          class="frame unavailable p-6 md:col-span-2"
        >
          <p class="t-label text-2xl">
            Нет мест по запросу «{{ filter }}»
          </p>
        </div>
      </nav>

      <nav
        v-else
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Склады"
      >
        <LocationRow
          v-for="node in roots"
          :key="node.id"
          :to="`/browse/${node.id}`"
          :name="node.name"
          :hint="node.children.length ? `Внутри: ${node.children.length}` : undefined"
        />
      </nav>
    </template>
  </div>
</template>
