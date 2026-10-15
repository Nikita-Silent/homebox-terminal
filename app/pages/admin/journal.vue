<script setup lang="ts">
import type { JournalEntry, JournalPage } from '#shared/types/terminal'
import { ArrowRight, RefreshCw, Search } from '@lucide/vue'

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom'

const PERIODS: { id: Period, label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: 'week', label: '7 дней' },
  { id: 'month', label: '30 дней' },
  { id: 'year', label: 'Год' },
  { id: 'custom', label: 'Период' },
]

const route = useRoute()
const router = useRouter()

const isPeriod = (v: unknown): v is Period => PERIODS.some(p => p.id === v)
const queryString = (v: unknown) => (typeof v === 'string' ? v : '')

// Filters live in the address, so a report can be reopened or sent as a link.
const period = ref<Period>(isPeriod(route.query.period) ? route.query.period : 'week')
const fromDate = ref(queryString(route.query.from))
const toDate = ref(queryString(route.query.to))
const userId = ref(queryString(route.query.user))
const search = ref(queryString(route.query.q))
const debouncedSearch = refDebounced(search, 300)

const page = ref<JournalPage | null>(null)
const entries = ref<JournalEntry[]>([])
const loading = ref(false)
const apiError = ref<ApiError | null>(null)

/** `YYYY-MM-DD` of a local date. */
function isoDay(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const parseDay = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null)

/** Local-time bounds: `from` inclusive, `to` exclusive. */
const range = computed<{ from: Date, to: Date } | null>(() => {
  const today = startOfDay(new Date())
  switch (period.value) {
    case 'today': return { from: today, to: addDays(today, 1) }
    case 'yesterday': return { from: addDays(today, -1), to: today }
    case 'week': return { from: addDays(today, -6), to: addDays(today, 1) }
    case 'month': return { from: addDays(today, -29), to: addDays(today, 1) }
    case 'year': return { from: addDays(today, -364), to: addDays(today, 1) }
    case 'custom': {
      const from = parseDay(fromDate.value)
      const to = parseDay(toDate.value)
      if (!from || !to || to < from) return null
      return { from, to: addDays(to, 1) }
    }
  }
  return null
})

const todayIso = isoDay(new Date())
function choosePeriod(id: Period) {
  if (id === 'custom' && !fromDate.value) {
    fromDate.value = isoDay(addDays(new Date(), -30))
    toDate.value = todayIso
  }
  period.value = id
}

let seq = 0
async function load(append = false) {
  const bounds = range.value
  if (!bounds) return
  const current = ++seq
  loading.value = true
  apiError.value = null
  try {
    const data = await $fetch<JournalPage>('/api/admin/journal', {
      query: {
        from: bounds.from.toISOString(),
        to: bounds.to.toISOString(),
        userId: userId.value || undefined,
        q: debouncedSearch.value.trim() || undefined,
        offset: append ? entries.value.length : 0,
      },
    })
    if (current !== seq) return
    page.value = data
    entries.value = append ? [...entries.value, ...data.entries] : data.entries
  }
  catch (e) {
    if (current === seq) apiError.value = toApiError(e)
  }
  finally {
    if (current === seq) loading.value = false
  }
}

watch([range, userId, debouncedSearch], () => {
  router.replace({
    query: {
      period: period.value,
      ...(period.value === 'custom' ? { from: fromDate.value, to: toDate.value } : {}),
      ...(userId.value ? { user: userId.value } : {}),
      ...(debouncedSearch.value.trim() ? { q: debouncedSearch.value.trim() } : {}),
    },
  })
  load()
}, { immediate: true })

const dayFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
const timeFormat = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' })

/** Entries grouped by local day, newest first (the server already sorts them). */
const days = computed(() => {
  const groups: { key: string, title: string, entries: JournalEntry[] }[] = []
  for (const entry of entries.value) {
    const date = new Date(entry.createdAt)
    const key = isoDay(date)
    let group = groups.at(-1)
    if (group?.key !== key) {
      group = { key, title: dayFormat.format(date), entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
  }
  return groups
})

function outcome(entry: JournalEntry) {
  if (entry.status !== 'done') return entry.message ?? ''
  const uid = entry.target?.assetId ? `UID ${entry.target.assetId}` : ''
  switch (entry.kind) {
    case 'whole': return 'Запись перенесена целиком'
    case 'merge': return entry.sourceRemoved
      ? `Добавлено к записи ${uid} (стало ${entry.target?.quantity} шт.), пустая запись удалена`
      : `Добавлено к записи ${uid} (стало ${entry.target?.quantity} шт.)`
    case 'split': return `Новая запись ${uid}`
  }
  return ''
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Завершается',
  failed: 'Не выполнено',
  needs_attention: 'Нужна проверка',
}

const customInvalid = computed(() => period.value === 'custom' && !range.value)
</script>

<template>
  <div class="flex flex-col gap-6">
    <h1 class="t-label text-4xl sm:text-6xl">
      Журнал перемещений
    </h1>

    <section
      class="flex flex-col gap-3"
      aria-label="Отбор"
    >
      <div
        class="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Период"
      >
        <button
          v-for="p in PERIODS"
          :key="p.id"
          type="button"
          role="radio"
          :aria-checked="period === p.id"
          class="t-label frame h-14 px-4 text-xl"
          :class="period === p.id ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash active:bg-ink active:text-paper'"
          @click="choosePeriod(p.id)"
        >
          {{ p.label }}
        </button>
      </div>

      <div
        v-if="period === 'custom'"
        class="grid gap-3 sm:grid-cols-2"
      >
        <label class="frame flex flex-col bg-paper px-4 py-2">
          <span class="t-small">С</span>
          <input
            v-model="fromDate"
            type="date"
            :max="toDate || todayIso"
            class="h-10 bg-transparent text-xl font-semibold focus:outline-none"
          >
        </label>
        <label class="frame flex flex-col bg-paper px-4 py-2">
          <span class="t-small">По</span>
          <input
            v-model="toDate"
            type="date"
            :min="fromDate"
            :max="todayIso"
            class="h-10 bg-transparent text-xl font-semibold focus:outline-none"
          >
        </label>
      </div>

      <div class="grid gap-3 lg:grid-cols-[minmax(0,20rem)_1fr]">
        <label class="frame flex flex-col bg-paper px-4 py-2">
          <span class="t-small">Сотрудник</span>
          <select
            v-model="userId"
            class="h-10 min-w-0 bg-transparent text-xl font-semibold focus:outline-none"
          >
            <option value="">
              Все сотрудники
            </option>
            <option
              v-for="actor in page?.actors ?? []"
              :key="actor.id"
              :value="actor.id"
            >
              {{ actor.name }}
            </option>
          </select>
        </label>
        <div class="frame flex items-center gap-3 bg-paper px-4">
          <Search
            class="size-6 shrink-0"
            :stroke-width="2.5"
            aria-hidden="true"
          />
          <label
            class="sr-only"
            for="journal-search"
          >Оборудование, UID или место</label>
          <input
            id="journal-search"
            v-model="search"
            type="search"
            autocomplete="off"
            placeholder="Оборудование, UID или место"
            class="h-16 min-w-0 flex-1 bg-transparent text-xl font-semibold placeholder:font-normal placeholder:text-ink-soft focus:outline-none"
          >
        </div>
      </div>
    </section>

    <StatusStrip
      v-if="customInvalid"
      kind="info"
      message="Укажите период: дата «по» не раньше даты «с»."
    />

    <StatusStrip
      v-else-if="apiError"
      kind="error"
      title="Не удалось загрузить журнал"
      :message="apiError.message"
    >
      <Button
        variant="outline"
        size="lg"
        class="mt-4 border-paper"
        @click="load()"
      >
        <RefreshCw />
        Повторить
      </Button>
    </StatusStrip>

    <div
      v-else-if="!page"
      class="frame hatch-pending h-64"
      aria-busy="true"
    />

    <template v-else>
      <div
        class="frame grid grid-cols-2 bg-paper"
        :aria-busy="loading"
      >
        <div class="px-5 py-3">
          <p class="t-small">
            Операций
          </p>
          <p class="t-num text-5xl">
            {{ page.total }}
          </p>
        </div>
        <div class="border-l-[3px] border-ink px-5 py-3">
          <p class="t-small">
            Перемещено
          </p>
          <p class="t-num text-5xl">
            {{ page.totalQuantity }}<span class="t-label ml-2 text-xl">шт.</span>
          </p>
        </div>
      </div>

      <div
        v-if="!entries.length"
        class="frame unavailable p-6"
      >
        <p class="t-label text-2xl">
          За этот период перемещений нет
        </p>
        <p class="mt-2 text-lg">
          Выберите другой период или снимите отбор по сотруднику и поиску.
        </p>
      </div>

      <section
        v-for="day in days"
        :key="day.key"
        class="flex flex-col gap-3"
        :aria-label="day.title"
      >
        <h2 class="t-label pt-2 text-2xl first-letter:uppercase">
          {{ day.title }}
        </h2>
        <NuxtLink
          v-for="entry in day.entries"
          :key="entry.opId"
          :to="`/result/${entry.opId}`"
          class="frame group grid bg-paper hover:bg-wash active:bg-ink active:text-paper sm:grid-cols-[7rem_1fr_auto]"
        >
          <div class="flex items-baseline justify-between gap-3 border-b-[3px] border-ink px-4 py-3 sm:block sm:border-r-[3px] sm:border-b-0">
            <p class="t-num text-3xl">
              {{ timeFormat.format(new Date(entry.createdAt)) }}
            </p>
            <p class="text-base font-semibold sm:mt-2 sm:break-words">
              {{ entry.actor?.name ?? 'до входа по PIN' }}
            </p>
          </div>

          <div class="min-w-0 px-4 py-3">
            <p class="t-label text-2xl break-words">
              {{ entry.item.name }}
              <span
                v-if="entry.item.assetId"
                class="t-num ml-1 text-lg whitespace-nowrap text-ink-soft group-active:text-paper"
              >UID {{ entry.item.assetId }}</span>
            </p>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 text-lg font-semibold">
              <span>{{ pathText(entry.from) || 'Без места' }}</span>
              <ArrowRight
                class="size-5 shrink-0"
                :stroke-width="2.5"
                aria-label="на"
              />
              <span>{{ pathText(entry.to) }}</span>
            </p>
            <p class="mt-1 text-base">
              <span
                v-if="entry.status !== 'done'"
                class="t-label mr-2 inline-block border-[3px] border-ink"
                :class="entry.status === 'pending' ? 'hatch-pending px-2' : entry.status === 'needs_attention' ? 'hatch-attention px-2' : 'bg-ink px-2 text-paper'"
              ><span :class="entry.status !== 'failed' && 'bg-paper px-1 text-ink'">{{ STATUS_LABEL[entry.status] }}</span></span>
              {{ outcome(entry) }}
            </p>
          </div>

          <p class="t-num flex items-baseline gap-2 border-t-[3px] border-ink px-4 py-3 text-5xl sm:flex-col sm:items-end sm:justify-center sm:border-t-0 sm:border-l-[3px]">
            {{ entry.quantity }}<span class="t-label text-lg">шт.</span>
          </p>
        </NuxtLink>
      </section>

      <Button
        v-if="entries.length < page.total"
        variant="outline"
        size="touch"
        :disabled="loading"
        @click="load(true)"
      >
        Показать ещё {{ Math.min(50, page.total - entries.length) }}
      </Button>
    </template>
  </div>
</template>
