<script setup lang="ts">
import type { TransferResult } from '#shared/types/terminal'
import { ArrowRight, Check, RotateCcw, ScanBarcode } from '@lucide/vue'

const route = useRoute()
const opId = String(route.params.opId)
const cached = useState<TransferResult | null>(`transfer:${opId}`, () => null)

const result = ref<TransferResult | null>(cached.value)
const apiError = ref<ApiError | null>(null)

async function refresh() {
  try {
    result.value = await $fetch<TransferResult>(`/api/transfers/${opId}`)
    apiError.value = null
  }
  catch (e) {
    if (!result.value) apiError.value = toApiError(e)
  }
}

if (!result.value) await refresh()

// Pending operations finish on the server; keep checking until they settle.
const { pause } = useIntervalFn(async () => {
  if (result.value?.status !== 'pending') return pause()
  await refresh()
}, 3000)

const nextButton = ref<{ $el: HTMLElement } | null>(null)
onMounted(() => nextButton.value?.$el?.focus({ preventScroll: true }))

/** The next scan starts the next move without touching the screen. */
useScanner(async (code) => {
  try {
    const found = await lookupCode(code)
    if (found.items.length === 1) await navigateTo(`/item/${found.items[0]!.id}`)
    else await navigateTo({ path: '/', query: { q: code } })
  }
  catch {
    await navigateTo({ path: '/', query: { q: code } })
  }
})

const stamp = computed(() => {
  if (!result.value) return ''
  const when = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    .format(new Date(result.value.createdAt))
  return result.value.actor ? `${result.value.actor.name} · ${when}` : when
})

const headline = computed(() => {
  switch (result.value?.status) {
    case 'done': return 'Перемещено'
    case 'pending': return 'Завершается'
    case 'needs_attention': return 'Нужна проверка'
    default: return 'Не выполнено'
  }
})
</script>

<template>
  <div class="flex flex-col gap-4 sm:gap-6">
    <StatusStrip
      v-if="apiError"
      kind="error"
      title="Операция не найдена"
      :message="apiError.message"
    />

    <template v-else-if="result">
      <!-- The confirmed move prints as a fresh label. -->
      <article
        class="frame relative bg-paper"
        :class="result.status === 'done' && 'label-feed'"
      >
        <header
          class="flex items-center gap-4 px-5 py-3 sm:py-4"
          :class="{
            'bg-ink text-paper': result.status === 'done' || result.status === 'failed',
            'hatch-pending border-b-[3px] border-ink': result.status === 'pending',
            'hatch-attention border-b-[3px] border-ink': result.status === 'needs_attention',
          }"
          role="status"
        >
          <span
            class="t-label flex items-center gap-3 text-3xl sm:text-6xl"
            :class="(result.status === 'pending' || result.status === 'needs_attention') && 'bg-paper px-3 py-1 frame'"
          >
            <Check
              v-if="result.status === 'done'"
              class="size-9 sm:size-12"
              :stroke-width="3.5"
            />
            {{ headline }}
          </span>
        </header>

        <div class="px-5 pt-3 pb-1 sm:pt-5 sm:pb-2">
          <p class="t-label text-2xl break-words sm:text-5xl">
            {{ result.source.name }}
          </p>
        </div>

        <div class="grid items-stretch gap-0 sm:grid-cols-[auto_1fr]">
          <div class="flex flex-col justify-end px-5 py-2 sm:py-4">
            <p
              v-if="result.status !== 'done'"
              class="t-small"
            >
              Количество
            </p>
            <p class="t-num text-6xl sm:text-8xl">
              {{ result.quantity }}<span class="t-label ml-2 text-2xl">шт.</span>
            </p>
          </div>
          <div class="flex flex-col justify-end border-t-[3px] border-ink px-5 py-3 sm:border-t-0 sm:border-l-[3px] sm:py-4">
            <p class="t-small">
              {{ result.status === 'done' ? 'Теперь лежит' : 'Куда' }}
            </p>
            <template v-if="result.target">
              <p
                v-if="result.target.path.length > 1"
                class="mt-1 text-xl font-semibold"
              >
                {{ pathText(result.target.path.slice(0, -1)) }}
              </p>
              <p class="t-label text-4xl break-words sm:text-6xl">
                {{ result.target.location?.name }}
              </p>
              <p class="mt-2 flex flex-wrap items-baseline gap-x-4 text-lg font-semibold">
                <span
                  v-if="result.target.assetId"
                  class="t-num bg-ink px-2 py-1 text-2xl text-paper"
                >UID {{ result.target.assetId }}</span>
                <span>Запись «{{ result.target.name }}»: {{ result.target.quantity }} шт.</span>
              </p>
            </template>
            <p
              v-else
              class="t-label text-5xl"
            >
              —
            </p>
          </div>
        </div>

        <div
          v-if="result.status === 'done'"
          class="rule px-5 py-3 text-base font-medium sm:py-4 sm:text-lg"
        >
          <template v-if="result.kind === 'whole'">
            Запись переехала целиком вместе с историей.
          </template>
          <template v-else-if="result.sourceRemoved">
            Всё количество добавлено к записи на полке, пустая запись на старом месте удалена.
          </template>
          <template v-else>
            На старом месте «{{ pathText(result.source.path) || result.source.location?.name }}» осталось {{ result.source.quantity }} шт.
          </template>
          Данные уже в Homebox.
        </div>

        <div
          v-else
          class="rule px-5 py-4"
        >
          <p class="text-xl font-semibold">
            {{ result.message }}
          </p>
          <p
            v-if="result.status === 'needs_attention'"
            class="mt-2 text-lg"
          >
            Откройте эту запись в Homebox, проверьте количество и место, при необходимости исправьте вручную.
            Номер операции: {{ result.opId }}.
          </p>
          <p
            v-else-if="result.status === 'pending'"
            class="mt-2 text-lg"
          >
            Можно продолжать работу: экран обновится сам.
          </p>
        </div>

        <p
          v-if="stamp"
          class="rule-thin px-5 py-2 text-base font-semibold"
        >
          Сотрудник: {{ stamp }}
        </p>
      </article>

      <div class="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Button
          ref="nextButton"
          as-child
          size="touch"
          class="h-auto min-h-20 py-3 text-2xl whitespace-normal sm:min-h-24 sm:py-4 sm:text-3xl"
        >
          <NuxtLink to="/">
            <ScanBarcode class="size-8" />
            Следующее оборудование
          </NuxtLink>
        </Button>
        <Button
          v-if="result.status === 'failed'"
          as-child
          size="touch"
          variant="outline"
          class="h-auto min-h-24 py-4 whitespace-normal"
        >
          <NuxtLink :to="`/item/${result.source.id}/move`">
            <RotateCcw />
            Попробовать снова
          </NuxtLink>
        </Button>
        <Button
          v-else-if="!result.sourceRemoved || result.target"
          as-child
          size="touch"
          variant="outline"
          class="h-auto min-h-24 py-4 whitespace-normal"
        >
          <NuxtLink :to="`/item/${result.target?.id ?? result.source.id}`">
            Открыть карточку
            <ArrowRight />
          </NuxtLink>
        </Button>
      </div>
      <p class="text-lg text-ink-soft">
        Отсканируйте следующее оборудование — карточка откроется сразу.
      </p>
    </template>
  </div>
</template>
