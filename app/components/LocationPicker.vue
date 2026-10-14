<script setup lang="ts">
import type { LocationNode } from '#shared/types/terminal'
import { Check, ChevronDown, ChevronRight, Search } from '@lucide/vue'

export interface PickedLocation {
  id: string
  name: string
  path: string
}

const props = defineProps<{
  tree: LocationNode[]
  /** The item's current location: shown, but cannot be picked. */
  currentId: string | null
}>()

const model = defineModel<PickedLocation | null>({ required: true })
const list = ref<HTMLElement | null>(null)

/** Keep the chosen destination visible inside the list, whether it was tapped or scanned. */
watch(() => model.value?.id, async (id) => {
  if (!id) return
  await nextTick()
  const row = list.value?.querySelector<HTMLElement>(`[data-id="${id}"]`)
  if (row && list.value) list.value.scrollTop = row.offsetTop - list.value.clientHeight / 3
}, { immediate: true, flush: 'post' })

interface Row {
  node: LocationNode
  depth: number
  path: string
}

const filter = ref('')
const expanded = ref(new Set<string>())

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim()

const flat = computed(() => {
  const rows: Row[] = []
  const walk = (nodes: LocationNode[], depth: number, parents: string[]) => {
    for (const node of nodes) {
      const path = [...parents, node.name].join(' / ')
      rows.push({ node, depth, path })
      walk(node.children, depth + 1, [...parents, node.name])
    }
  }
  walk(props.tree, 0, [])
  return rows
})

const parentOf = computed(() => {
  const map = new Map<string, string>()
  const walk = (nodes: LocationNode[], parent: string | null) => {
    for (const node of nodes) {
      if (parent) map.set(node.id, parent)
      walk(node.children, node.id)
    }
  }
  walk(props.tree, null)
  return map
})

/** Ancestors of the current and the chosen location start expanded, so both are visible. */
watch(
  () => [props.currentId, model.value?.id, parentOf.value] as const,
  ([current, chosen, parents]) => {
    const next = new Set(expanded.value)
    for (const target of [current, chosen]) {
      for (let id = target ? parents.get(target) : undefined; id; id = parents.get(id)) next.add(id)
    }
    expanded.value = next
  },
  { immediate: true },
)

const visible = computed<Row[]>(() => {
  const q = normalize(filter.value)
  if (q) {
    const words = q.split(/\s+/)
    return flat.value
      .filter(row => words.every(w => normalize(row.path).includes(w)))
      .map(row => ({ ...row, depth: 0 }))
  }
  const rows: Row[] = []
  const walk = (nodes: LocationNode[], depth: number, parents: string[]) => {
    for (const node of nodes) {
      const path = [...parents, node.name].join(' / ')
      rows.push({ node, depth, path })
      if (expanded.value.has(node.id)) walk(node.children, depth + 1, [...parents, node.name])
    }
  }
  walk(props.tree, 0, [])
  return rows
})

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function pick(row: Row) {
  if (row.node.id === props.currentId) return
  model.value = { id: row.node.id, name: row.node.name, path: row.path }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="frame flex items-center gap-3 bg-paper px-4">
      <Search
        class="size-6 shrink-0"
        :stroke-width="2.5"
        aria-hidden="true"
      />
      <label
        class="sr-only"
        for="location-filter"
      >Найти локацию</label>
      <input
        id="location-filter"
        v-model="filter"
        type="search"
        autocomplete="off"
        placeholder="Найти склад, помещение или полку"
        class="h-16 min-w-0 flex-1 bg-transparent text-xl font-semibold placeholder:font-normal placeholder:text-ink-soft focus:outline-none"
      >
    </div>

    <div
      v-if="model"
      class="frame flex items-center gap-4 bg-ink px-5 py-3 text-paper"
      aria-live="polite"
    >
      <Check
        class="size-7 shrink-0"
        :stroke-width="3"
        aria-hidden="true"
      />
      <span class="min-w-0">
        <span class="t-small block">Куда: {{ model.path.split(' / ').slice(0, -1).join(' / ') || 'верхний уровень' }}</span>
        <span class="t-label block text-3xl break-words">{{ model.name }}</span>
      </span>
    </div>

    <ul
      ref="list"
      class="frame relative max-h-[60vh] overflow-y-auto bg-paper"
      role="tree"
      aria-label="Локации"
    >
      <li
        v-for="row in visible"
        :key="row.node.id"
        :data-id="row.node.id"
        role="treeitem"
        :aria-selected="model?.id === row.node.id"
        :aria-expanded="row.node.children.length && !filter ? expanded.has(row.node.id) : undefined"
        class="flex border-b border-ink last:border-b-0"
      >
        <button
          v-if="row.node.children.length && !filter"
          type="button"
          class="flex w-16 shrink-0 items-center justify-center border-r border-ink hover:bg-wash active:bg-ink active:text-paper"
          :style="{ '--depth': row.depth }"
          :class="'ml-[calc(var(--depth)*0.75rem)] sm:ml-[calc(var(--depth)*1.75rem)]'"
          :aria-label="expanded.has(row.node.id) ? `Свернуть ${row.node.name}` : `Развернуть ${row.node.name}`"
          @click="toggle(row.node.id)"
        >
          <component
            :is="expanded.has(row.node.id) ? ChevronDown : ChevronRight"
            class="size-7"
            :stroke-width="2.5"
          />
        </button>
        <span
          v-else
          class="w-16 shrink-0"
          :style="{ '--depth': filter ? 0 : row.depth }"
          :class="'ml-[calc(var(--depth)*0.75rem)] sm:ml-[calc(var(--depth)*1.75rem)]'"
        />
        <button
          type="button"
          class="flex min-h-16 min-w-0 flex-1 items-center gap-4 px-4 py-2 text-left"
          :class="[
            model?.id === row.node.id ? 'bg-ink text-paper' : 'hover:bg-wash active:bg-ink active:text-paper',
            row.node.id === currentId && 'cursor-not-allowed text-ink-soft outline-dashed outline-[3px] -outline-offset-[8px] outline-ink-soft',
          ]"
          :disabled="row.node.id === currentId"
          @click="pick(row)"
        >
          <span class="min-w-0 flex-1">
            <span
              v-if="filter"
              class="block text-base font-medium"
            >{{ row.path.split(' / ').slice(0, -1).join(' / ') }}</span>
            <span class="t-label block text-2xl break-words">{{ row.node.name }}</span>
            <span
              v-if="row.node.id === currentId"
              class="t-small mt-1 block"
            >Сейчас здесь</span>
          </span>
          <Check
            v-if="model?.id === row.node.id"
            class="size-7 shrink-0"
            :stroke-width="3"
            aria-hidden="true"
          />
        </button>
      </li>
      <li
        v-if="!visible.length"
        class="p-6 text-lg"
      >
        Нет локаций по запросу «{{ filter }}».
      </li>
    </ul>
  </div>
</template>
