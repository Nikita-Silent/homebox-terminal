<script setup lang="ts">
import type { HealthStatus, HomeboxLink } from '#shared/types/terminal'

/**
 * Pill in the rail: can the terminal work with Homebox right now. Polls the public `/api/health`
 * (it does not extend the session); a tap checks again at once. Fine = a quiet outline,
 * anything else = an inverted label with the attention cross-hatch.
 */

type State = 'checking' | HomeboxLink | 'untested' | 'server_unreachable'

const POLL_MS = 20_000

const state = ref<State>('checking')
const version = ref<string | null>(null)

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
    class="t-label flex h-10 shrink-0 items-stretch border-[3px] text-sm whitespace-nowrap focus-visible:outline-paper"
    :class="[
      problem ? 'border-paper bg-paper text-ink' : 'border-paper text-paper hover:bg-paper hover:text-ink',
      state === 'checking' && 'border-dashed',
    ]"
    :aria-label="`${label[1]}. Проверить ещё раз`"
    :title="version ? `Homebox ${version}` : undefined"
    @click="refresh"
  >
    <span
      class="w-4 shrink-0 border-r-[3px]"
      :class="problem ? 'hatch-attention border-ink' : 'border-current'"
      aria-hidden="true"
    >
      <span
        v-if="state === 'ok'"
        class="block size-full bg-current"
      />
    </span>
    <span class="flex items-center px-2 sm:hidden">{{ label[0] }}</span>
    <span class="hidden items-center px-3 sm:flex">{{ label[1] }}</span>
  </button>
</template>
