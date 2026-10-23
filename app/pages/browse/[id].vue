<script setup lang="ts">
import type { LocationContents } from '#shared/types/terminal'
import { Package, Warehouse } from '@lucide/vue'

type View = 'places' | 'items'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { data, error, refresh, status } = await useFetch<LocationContents>(() => `/api/locations/${id.value}`)
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
const parent = computed(() => data.value?.path.at(-2) ?? null)
const notice = ref<string | null>(null)
useBrowseScanner((message) => {
  notice.value = message
})

/**
 * A room with 25 shelves would push its own equipment far below: places and equipment are two
 * views of one screen. The choice lives in the address, so «Назад» from an item returns to it.
 */
const view = computed<View>(() => {
  if (route.query.view === 'items' || route.query.view === 'places') return route.query.view
  return data.value?.sublocations.length ? 'places' : 'items'
})
const filter = ref('')
watch(id, () => {
  filter.value = ''
})

function show(next: View) {
  filter.value = ''
  router.replace({ query: { ...route.query, view: next } })
}

const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е')
const words = computed(() => normalize(filter.value).split(/\s+/).filter(Boolean))
const fits = (text: string) => words.value.every(w => normalize(text).includes(w))

const places = computed(() => data.value?.sublocations.filter(place => fits(place.name)) ?? [])
const items = computed(() => data.value?.items.filter(item => fits(`${item.name} ${item.assetId} ${item.modelNumber}`)) ?? [])
/** Short lists need no filter. */
const filterable = computed(() => (view.value === 'places' ? data.value?.sublocations.length ?? 0 : data.value?.items.length ?? 0) > 8)

const tabClass = (on: boolean) => [
  't-label frame flex min-h-16 flex-1 items-center justify-center gap-3 px-4 text-2xl',
  on ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash active:bg-ink active:text-paper',
]
</script>

<template>
  <div class="flex flex-col gap-6 short:gap-4">
    <BackLink :to="parent ? `/browse/${parent.id}` : '/browse'">
      {{ parent ? parent.name : 'Все склады' }}
    </BackLink>

    <StatusStrip
      v-if="apiError"
      kind="error"
      :title="apiError.code === 'NOT_FOUND' ? 'Место не найдено' : 'Не удалось загрузить'"
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
      v-else-if="!data || status === 'pending'"
      text="Открываем место…"
    />

    <template v-else>
      <header>
        <!-- Only when it says more than the back link above: the whole way down from the warehouse. -->
        <nav
          v-if="data.path.length > 2"
          class="flex flex-wrap items-center gap-x-1 text-lg font-semibold"
          aria-label="Путь"
        >
          <template
            v-for="(step, i) in data.path.slice(0, -1)"
            :key="step.id"
          >
            <span
              v-if="i"
              aria-hidden="true"
            >/</span>
            <NuxtLink
              :to="`/browse/${step.id}`"
              class="flex min-h-16 items-center px-2 underline decoration-2 underline-offset-4 first:pl-0 hover:bg-wash active:bg-ink active:text-paper"
            >{{ step.name }}</NuxtLink>
          </template>
        </nav>
        <h1 class="t-label text-5xl break-words sm:text-7xl short:sm:text-6xl">
          {{ data.location.name }}
        </h1>
      </header>

      <StatusStrip
        v-if="notice"
        kind="info"
        :message="notice"
      />

      <div
        v-if="data.sublocations.length"
        class="flex gap-3"
        role="tablist"
        aria-label="Что показать"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="view === 'places'"
          :class="tabClass(view === 'places')"
          @click="show('places')"
        >
          <Warehouse
            class="size-7 shrink-0"
            :stroke-width="2.5"
          />
          Места · {{ data.sublocations.length }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="view === 'items'"
          :class="tabClass(view === 'items')"
          @click="show('items')"
        >
          <Package
            class="size-7 shrink-0"
            :stroke-width="2.5"
          />
          Оборудование · {{ data.items.length }}
        </button>
      </div>

      <FilterField
        v-if="filterable"
        id="place-filter"
        v-model="filter"
        :label="view === 'places' ? 'Найти полку или помещение здесь' : 'Найти оборудование здесь'"
      />

      <section
        v-if="view === 'places'"
        aria-label="Места внутри"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <LocationRow
          v-for="place in places"
          :key="place.id"
          :to="`/browse/${place.id}`"
          :name="place.name"
        />
        <div
          v-if="!places.length"
          class="frame unavailable p-6 md:col-span-2 xl:col-span-3"
        >
          <p class="t-label text-2xl">
            Нет мест по запросу «{{ filter }}»
          </p>
        </div>
      </section>

      <section
        v-else
        aria-labelledby="items-heading"
        class="flex flex-col gap-3"
      >
        <h2
          v-if="!data.sublocations.length"
          id="items-heading"
          class="t-label text-3xl"
        >
          Оборудование здесь · {{ data.items.length }}
        </h2>
        <h2
          v-else
          id="items-heading"
          class="sr-only"
        >
          Оборудование здесь
        </h2>
        <ItemRow
          v-for="item in items"
          :key="item.id"
          :item="item"
          :place="false"
        />
        <div
          v-if="!data.items.length"
          class="frame unavailable p-6"
        >
          <p class="t-label text-2xl">
            Здесь ничего не лежит
          </p>
          <p
            v-if="data.sublocations.length"
            class="mt-2 text-lg"
          >
            Оборудование — на местах внутри.
          </p>
        </div>
        <div
          v-else-if="!items.length"
          class="frame unavailable p-6"
        >
          <p class="t-label text-2xl">
            Нет оборудования по запросу «{{ filter }}»
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
