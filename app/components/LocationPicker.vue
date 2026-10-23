<script setup lang="ts">
import type { LocationNode } from '#shared/types/terminal'
import { Check, ChevronRight, CornerLeftUp, MapPin } from '@lucide/vue'

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

/**
 * One level of the tree at a time, in the page itself (no scroll box inside the page). A place with
 * places inside opens on a tap; the place itself is chosen with its own «Сюда» key at the top of
 * the opened level. One tap never means two things.
 */
interface Entry {
  node: LocationNode
  /** Root → node. */
  chain: LocationNode[]
}

const byId = computed(() => {
  const map = new Map<string, Entry>()
  const walk = (nodes: LocationNode[], parents: LocationNode[]) => {
    for (const node of nodes) {
      const chain = [...parents, node]
      map.set(node.id, { node, chain })
      walk(node.children, chain)
    }
  }
  walk(props.tree, [])
  return map
})

const names = (chain: LocationNode[]) => chain.map(n => n.name).join(' / ')
const parentId = (id: string | null | undefined) => (id ? byId.value.get(id)?.chain.at(-2)?.id ?? null : null)

/** The opened level: `null` is the list of warehouses. */
const level = ref<string | null>(null)
const opened = computed(() => (level.value ? byId.value.get(level.value) ?? null : null))
const rows = computed(() => opened.value?.node.children ?? props.tree)

// Opens where the choice is: next to the chosen place, else next to where the item lies now.
watch(
  () => [model.value?.id, byId.value] as const,
  ([chosen]) => {
    const near = chosen ?? props.currentId
    if (near && byId.value.has(near)) level.value = parentId(near)
  },
  { immediate: true },
)

const top = ref<HTMLElement | null>(null)
function open(id: string | null) {
  level.value = id
  filter.value = ''
  // A long level scrolled down: the next one starts from its top.
  nextTick(() => {
    const box = top.value?.getBoundingClientRect()
    const rail = document.querySelector('[data-app-rail]')?.getBoundingClientRect().bottom ?? 0
    if (box && box.top < rail) window.scrollBy({ top: box.top - rail - 12 })
  })
}

function pick(node: LocationNode) {
  if (node.id === props.currentId) return
  const entry = byId.value.get(node.id)
  model.value = { id: node.id, name: node.name, path: names(entry?.chain ?? [node]) }
}

// ── Search across the whole tree, grouped by warehouse ─────────────────────

const filter = ref('')
const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim()

const found = computed(() => {
  const q = normalize(filter.value)
  if (!q) return null
  const words = q.split(/\s+/)
  const groups = new Map<string, { root: LocationNode, entries: Entry[] }>()
  for (const entry of byId.value.values()) {
    if (!words.every(w => normalize(names(entry.chain)).includes(w))) continue
    const root = entry.chain[0]!
    const group = groups.get(root.id) ?? { root, entries: [] }
    group.entries.push(entry)
    groups.set(root.id, group)
  }
  return [...groups.values()]
})

const rowClass = (node: LocationNode) => [
  'frame flex min-h-20 w-full min-w-0 items-center gap-4 px-4 py-2 text-left',
  model.value?.id === node.id
    ? 'bg-ink text-paper'
    : node.id === props.currentId
      ? 'unavailable cursor-not-allowed bg-paper text-ink-soft'
      : 'bg-paper hover:bg-wash active:bg-ink active:text-paper',
]
const crumbClass = 't-label flex min-h-16 items-center px-3 text-xl underline decoration-2 underline-offset-4 hover:bg-wash active:bg-ink active:text-paper'
</script>

<template>
  <div
    ref="top"
    class="flex flex-col gap-3"
  >
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
        <span class="block text-lg font-semibold">Куда: {{ model.path.split(' / ').slice(0, -1).join(' / ') || 'верхний уровень' }}</span>
        <span class="t-label block text-3xl break-words">{{ model.name }}</span>
      </span>
    </div>

    <FilterField
      id="location-filter"
      v-model="filter"
      label="Найти склад, помещение или полку"
    />

    <!-- Search: matches under their warehouse, each with its full way there. -->
    <div
      v-if="found"
      class="flex flex-col gap-4"
      aria-label="Найденные места"
    >
      <section
        v-for="group in found"
        :key="group.root.id"
        class="flex flex-col gap-2"
        :aria-label="group.root.name"
      >
        <h3 class="t-label border-b-[3px] border-ink pb-1 text-2xl">
          {{ group.root.name }}
        </h3>
        <ul class="grid gap-2 md:grid-cols-2">
          <li
            v-for="entry in group.entries"
            :key="entry.node.id"
            :data-id="entry.node.id"
          >
            <button
              type="button"
              :class="rowClass(entry.node)"
              :disabled="entry.node.id === currentId"
              :aria-pressed="model?.id === entry.node.id"
              @click="pick(entry.node)"
            >
              <span class="min-w-0 flex-1">
                <span
                  v-if="entry.chain.length > 2"
                  class="block text-base font-semibold"
                >{{ names(entry.chain.slice(1, -1)) }}</span>
                <span class="t-label block text-2xl break-words">{{ entry.node.name }}</span>
                <span
                  v-if="entry.node.id === currentId"
                  class="t-small mt-1 block"
                >Сейчас здесь</span>
              </span>
              <Check
                v-if="model?.id === entry.node.id"
                class="size-7 shrink-0"
                :stroke-width="3"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>
      <p
        v-if="!found.length"
        class="frame unavailable p-6 text-lg"
      >
        Нет мест по запросу «{{ filter }}».
      </p>
    </div>

    <!-- One level of the tree. -->
    <div
      v-else
      class="flex flex-col gap-3"
    >
      <nav
        class="flex flex-wrap items-center gap-x-1"
        aria-label="Уровень"
      >
        <button
          v-if="opened"
          type="button"
          :class="crumbClass"
          @click="open(null)"
        >
          Все склады
        </button>
        <span
          v-else
          class="t-label flex min-h-16 items-center text-xl"
        >Все склады</span>
        <template
          v-for="step in opened?.chain ?? []"
          :key="step.id"
        >
          <ChevronRight
            class="size-6 shrink-0"
            :stroke-width="2.5"
            aria-hidden="true"
          />
          <button
            v-if="step.id !== level"
            type="button"
            :class="crumbClass"
            @click="open(step.id)"
          >
            {{ step.name }}
          </button>
          <span
            v-else
            class="t-label flex min-h-16 items-center px-3 text-xl"
            aria-current="location"
          >{{ step.name }}</span>
        </template>
      </nav>

      <div
        v-if="opened"
        class="grid gap-3 sm:grid-cols-2"
      >
        <button
          type="button"
          class="frame flex min-h-20 items-center gap-3 bg-paper px-4 py-2 text-left hover:bg-wash active:bg-ink active:text-paper"
          @click="open(parentId(level))"
        >
          <CornerLeftUp
            class="size-7 shrink-0"
            :stroke-width="2.5"
          />
          <span class="t-label text-xl">На уровень выше</span>
        </button>
        <button
          type="button"
          :class="rowClass(opened.node)"
          :disabled="opened.node.id === currentId"
          :aria-pressed="model?.id === opened.node.id"
          @click="pick(opened.node)"
        >
          <MapPin
            class="size-7 shrink-0"
            :stroke-width="2.5"
          />
          <span class="min-w-0 flex-1">
            <span class="t-label block text-xl break-words">Сюда: «{{ opened.node.name }}»</span>
            <span class="block text-base font-medium">{{ opened.node.id === currentId ? 'Сейчас здесь' : 'не на полку внутри, а сюда' }}</span>
          </span>
        </button>
      </div>

      <ul
        class="grid gap-2 md:grid-cols-2"
        role="list"
        aria-label="Места"
      >
        <li
          v-for="node in rows"
          :key="node.id"
          :data-id="node.id"
        >
          <!-- A place with places inside opens; a place without them is chosen. -->
          <button
            v-if="node.children.length"
            type="button"
            :class="rowClass(node)"
            :aria-label="`Открыть «${node.name}»`"
            @click="open(node.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="t-label block text-2xl break-words">{{ node.name }}</span>
              <span class="block text-base font-medium">Внутри: {{ node.children.length }}<template v-if="node.id === currentId"> · сейчас здесь</template></span>
            </span>
            <Check
              v-if="model?.id === node.id"
              class="size-7 shrink-0"
              :stroke-width="3"
              aria-hidden="true"
            />
            <ChevronRight
              class="size-8 shrink-0"
              :stroke-width="3"
              aria-hidden="true"
            />
          </button>
          <button
            v-else
            type="button"
            :class="rowClass(node)"
            :disabled="node.id === currentId"
            :aria-pressed="model?.id === node.id"
            @click="pick(node)"
          >
            <span class="min-w-0 flex-1">
              <span class="t-label block text-2xl break-words">{{ node.name }}</span>
              <span
                v-if="node.id === currentId"
                class="t-small mt-1 block"
              >Сейчас здесь</span>
            </span>
            <Check
              v-if="model?.id === node.id"
              class="size-7 shrink-0"
              :stroke-width="3"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
