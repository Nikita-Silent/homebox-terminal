<script setup lang="ts">
import type { HealthStatus, HomeboxLink } from '#shared/types/terminal'

/**
 * Connection marker in the rail. Polls the public `/api/health`
 * (it does not extend the session); a tap checks again at once. Fine = a green square,
 * anything else = an inverted label with the attention cross-hatch.
 */

type State = 'checking' | HomeboxLink | 'untested' | 'server_unreachable'

const POLL_MS = 20_000

const state = ref<State>('checking')
const version = ref<string | null>(null)
const expanded = ref(false)
const detailsId = useId()

function toggleDetails() {
  expanded.value = !expanded.value
  if (expanded.value) refresh()
}

const LABELS: Record<Exclude<State, 'untested'>, [short: string, long: string]> = {
  checking: ['Homebox…', 'Проверяем Homebox'],
  ok: ['Homebox', 'Homebox на связи'],
  unreachable: ['Нет Homebox', 'Homebox недоступен'],
  unauthorized: ['Нет доступа', 'Homebox: ключ не принят'],
  not_configured: ['Нет Homebox', 'Homebox не настроен'],
  server_unreachable: ['Нет сети', 'Нет связи с терминалом'],
}

const label = computed(() => state.value === 'untested'
  ? ['Homebox?', `Homebox ${version.value} не проверен`]
  : LABELS[state.value])
const problem = computed(() => state.value !== 'ok' && state.value !== 'checking')

async function refresh() {
  try {
    const health = await $fetch<HealthStatus>('/api/health')
    version.value = health.homeboxVersion
    state.value = health.homebox === 'ok' && !health.homeboxTested ? 'untested' : health.homebox
  }
  catch {
    state.value = 'server_unreachable'
  }
}

let timer: ReturnType<typeof setInterval> | undefined
const onVisible = () => document.visibilityState === 'visible' && refresh()

onMounted(() => {
  refresh()
  timer = setInterval(refresh, POLL_MS)
  window.addEventListener('online', refresh)
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('online', refresh)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <span
    class="sr-only"
    role="status"
  >{{ label[1] }}</span>
  <button
    type="button"
    class="t-label flex shrink-0 text-sm whitespace-nowrap focus-visible:outline-paper"
    :class="[
      problem
        ? 'min-h-16 min-w-16 items-stretch border-[3px] border-paper bg-paper text-ink'
        : 'size-16 items-center justify-center text-paper active:bg-ink-soft',
    ]"
    :aria-label="`${label[1]}. ${expanded ? 'Скрыть статус' : 'Показать статус и проверить связь'}`"
    :aria-expanded="expanded"
    :aria-controls="detailsId"
    @click="toggleDetails"
  >
    <span
      class="shrink-0"
      :class="problem
        ? 'w-4 border-r-[3px] hatch-attention border-ink'
        : state === 'ok' ? 'size-3 bg-connection-ok' : 'size-3 border-2 border-dashed border-paper'"
      aria-hidden="true"
    />
    <template v-if="problem">
      <span class="flex items-center px-2 sm:hidden">{{ label[0] }}</span>
      <span class="hidden items-center px-3 sm:flex">{{ label[1] }}</span>
    </template>
  </button>
  <div
    v-if="expanded"
    :id="detailsId"
    class="absolute inset-x-0 top-full border-b-[3px] border-paper bg-ink px-4 py-3 text-paper sm:px-8"
  >
    <p class="font-semibold">{{ label[1] }}</p>
    <p v-if="version" class="text-sm">Версия {{ version }}</p>
    <p class="mt-1 text-sm">Коснитесь индикатора ещё раз, чтобы скрыть.</p>
  </div>
</template>
