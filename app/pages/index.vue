<script setup lang="ts">
import type { ItemSearchResult, ItemSummary } from '#shared/types/terminal'
import { Camera, List, LoaderCircle, Search, X } from '@lucide/vue'

const route = useRoute()
const router = useRouter()

const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const input = ref<HTMLInputElement | null>(null)
const results = ref<ItemSummary[] | null>(null)
const searched = ref('')
const loading = ref(false)
const notice = ref<string | null>(null)
const error = ref<ApiError | null>(null)
const cameraOpen = ref(false)

let searchSeq = 0

async function search(q: string) {
  const text = q.trim()
  if (text.length < 2) {
    results.value = null
    return
  }
  const seq = ++searchSeq
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<ItemSearchResult>('/api/items', { query: { q: text } })
    if (seq !== searchSeq) return
    results.value = data.items
    searched.value = text
    router.replace({ query: { q: text } })
  }
  catch (e) {
    if (seq === searchSeq) error.value = toApiError(e)
  }
  finally {
    if (seq === searchSeq) loading.value = false
  }
}

// Own timer instead of a debounce helper: a scanned code must be able to cancel the pending search.
let searchTimer: ReturnType<typeof setTimeout> | undefined
let skipSearch = false
watch(query, (q) => {
  notice.value = null
  clearTimeout(searchTimer)
  if (skipSearch) {
    skipSearch = false
    return
  }
  searchTimer = setTimeout(() => search(q), 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

/** Scanned codes (USB scanner, camera, or Enter in the field) resolve straight to the item. */
async function resolveCode(code: string) {
  // The code's own answer wins over a text search typed or scheduled before it.
  clearTimeout(searchTimer)
  searchSeq++
  cameraOpen.value = false
  notice.value = null
  error.value = null
  loading.value = true
  try {
    const found = await lookupCode(code)
    if (found.items.length === 1) {
      await navigateTo(`/item/${found.items[0]!.id}`)
      return
    }
    if (found.location) {
      // A shelf label on the start screen: show what lies there.
      await navigateTo(`/browse/${found.location.id}`)
      return
    }
    if (query.value !== code) skipSearch = true
    query.value = code
    results.value = found.items
    searched.value = code
  }
  catch (e) {
    error.value = toApiError(e)
  }
  finally {
    loading.value = false
  }
}

useScanner(resolveCode)

/** The field's own clear key: a gloved finger cannot select the text to erase it. */
function clearQuery() {
  clearTimeout(searchTimer)
  searchSeq++
  query.value = ''
  results.value = null
  error.value = null
  loading.value = false
  router.replace({ query: {} })
  input.value?.focus()
}

/** While a query is typed the screen belongs to its results: the title and the tour step aside. */
const idle = computed(() => !query.value.trim() && !results.value)

function submit() {
  const text = query.value.trim()
  if (!text) return
  // A fast Enter right after typing is how a scanner finishes a code in a focused field.
  resolveCode(text)
}

onMounted(() => {
  input.value?.focus()
  if (query.value) search(query.value)
})
</script>

<template>
  <div class="flex flex-col gap-8 short:gap-6">
    <h1
      class="t-label max-w-4xl text-4xl sm:text-6xl short:sm:text-5xl"
      :class="!idle && 'sr-only'"
    >
      Отсканируйте этикетку или найдите оборудование
    </h1>

    <form
      class="flex gap-3"
      role="search"
      @submit.prevent="submit"
    >
      <div class="frame flex h-20 min-w-0 flex-1 items-stretch bg-paper focus-within:outline-[4px] focus-within:outline-offset-3 focus-within:outline-ink">
        <label
          class="sr-only"
          for="search"
        >Название, модель, серийный номер или UID</label>
        <input
          id="search"
          ref="input"
          v-model="query"
          type="search"
          inputmode="search"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Название, модель, серийный номер или UID"
          class="h-full w-full min-w-0 flex-1 bg-transparent px-5 text-2xl font-semibold placeholder:font-normal placeholder:text-ink-soft focus:outline-none"
        >
        <button
          v-if="query"
          type="button"
          class="flex w-20 shrink-0 items-center justify-center border-l-[3px] border-ink hover:bg-wash active:bg-ink active:text-paper"
          aria-label="Очистить поиск"
          @click="clearQuery"
        >
          <X
            class="size-8"
            :stroke-width="2.5"
          />
        </button>
      </div>
      <Button
        type="submit"
        size="touch"
        class="h-20 max-lg:w-20 max-lg:px-0"
        aria-label="Найти"
      >
        <Search />
        <span class="max-lg:sr-only">Найти</span>
      </Button>
      <Button
        type="button"
        size="touch"
        variant="outline"
        class="h-20 max-lg:w-20 max-lg:px-0"
        aria-label="Камера"
        @click="cameraOpen = true"
      >
        <Camera />
        <span class="max-lg:sr-only">Камера</span>
      </Button>
    </form>

    <Button
      v-if="idle"
      as-child
      variant="outline"
      size="touch"
      class="h-auto min-h-20 justify-start py-3 text-left text-xl whitespace-normal sm:text-2xl"
    >
      <NuxtLink to="/browse">
        <List />
        Не знаю названия — выбрать из списка
      </NuxtLink>
    </Button>

    <StatusStrip
      v-if="error"
      kind="error"
      :message="error.message"
    />
    <StatusStrip
      v-else-if="notice"
      kind="info"
      :message="notice"
    />

    <section
      v-if="loading && !results"
      class="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Поиск"
    >
      <div
        v-for="n in 3"
        :key="n"
        class="frame hatch-pending h-24"
      />
    </section>

    <section
      v-else-if="results"
      class="flex flex-col gap-3"
      :aria-busy="loading"
      aria-label="Найденное оборудование"
    >
      <p
        v-if="loading"
        class="t-small flex h-6 items-center gap-2"
        role="status"
      >
        <LoaderCircle
          class="size-5 animate-spin"
          :stroke-width="2.5"
        />
        Ищем «{{ query.trim() }}»…
      </p>
      <p
        v-else
        class="t-small flex h-6 items-center"
      >
        {{ results.length ? `Найдено по «${searched}»: ${results.length}` : '' }}
      </p>
      <!-- The old answer stays in place but cannot be tapped: it may not match what is typed now. -->
      <div
        class="flex flex-col gap-3 transition-opacity"
        :class="loading && 'pointer-events-none opacity-35'"
        :inert="loading || undefined"
      >
        <ItemRow
          v-for="item in results"
          :key="item.id"
          :item="item"
        />
      </div>
      <div
        v-if="!results.length"
        class="frame unavailable p-8"
      >
        <p class="t-label text-3xl">
          Ничего не найдено по «{{ searched }}»
        </p>
        <p class="mt-2 text-lg">
          Проверьте написание или поищите по модели, серийному номеру или UID с этикетки (например, 000-011).
        </p>
        <Button
          as-child
          variant="outline"
          size="touch"
          class="mt-4 h-auto min-h-16 py-2 whitespace-normal"
        >
          <NuxtLink to="/browse">
            <List />
            Выбрать из списка
          </NuxtLink>
        </Button>
      </div>
    </section>

    <ol
      v-else-if="idle"
      class="grid gap-3 sm:grid-cols-3"
      aria-label="Как переместить оборудование"
    >
      <li
        v-for="(step, i) in ['Отсканируйте оборудование', 'Выберите или отсканируйте полку', 'Подтвердите перемещение']"
        :key="step"
        class="frame flex items-end gap-4 p-5"
      >
        <span class="t-num text-7xl">{{ i + 1 }}</span>
        <span class="t-label pb-1 text-2xl">{{ step }}</span>
      </li>
    </ol>

    <CameraScanner
      v-if="cameraOpen"
      @scan="resolveCode"
      @close="cameraOpen = false"
    />
  </div>
</template>
