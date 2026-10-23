<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'

/**
 * A period picked on one month grid with a finger: the first tap sets «с», the second «по».
 * Days are `YYYY-MM-DD` strings in local time; nothing after `max` can be chosen.
 */
const props = defineProps<{ max: string }>()
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parse = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : null)

const start = parse(to.value) ?? parse(props.max) ?? new Date()
const month = ref(new Date(start.getFullYear(), start.getMonth(), 1))

/** The second tap is still to come. */
const picking = ref(false)

const title = computed(() => new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(month.value))
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const days = computed(() => {
  const first = month.value
  // Monday first.
  const lead = (first.getDay() + 6) % 7
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => iso(new Date(first.getFullYear(), first.getMonth(), i + 1))),
  ]
})

const canNext = computed(() => iso(new Date(month.value.getFullYear(), month.value.getMonth() + 1, 1)) <= props.max)

function shift(by: number) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + by, 1)
}

function tap(day: string) {
  if (day > props.max) return
  if (!picking.value || day < from.value) {
    from.value = day
    to.value = day
    picking.value = true
    return
  }
  to.value = day
  picking.value = false
}

const inRange = (day: string) => day >= from.value && day <= to.value
const formatDay = (value: string) => {
  const date = parse(value)
  return date ? new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(date) : '—'
}
</script>

<template>
  <div class="frame flex flex-col gap-3 bg-paper p-3 sm:p-4">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="frame flex size-16 shrink-0 items-center justify-center bg-paper hover:bg-wash active:bg-ink active:text-paper"
        aria-label="Предыдущий месяц"
        @click="shift(-1)"
      >
        <ChevronLeft
          class="size-8"
          :stroke-width="3"
        />
      </button>
      <p class="t-label flex-1 text-center text-2xl first-letter:uppercase">
        {{ title }}
      </p>
      <button
        type="button"
        class="frame flex size-16 shrink-0 items-center justify-center bg-paper hover:bg-wash active:bg-ink active:text-paper disabled:border-dashed disabled:text-ink-soft"
        aria-label="Следующий месяц"
        :disabled="!canNext"
        @click="shift(1)"
      >
        <ChevronRight
          class="size-8"
          :stroke-width="3"
        />
      </button>
    </div>

    <p
      class="text-lg font-semibold"
      role="status"
    >
      {{ picking ? `С ${formatDay(from)} — коснитесь последнего дня` : `С ${formatDay(from)} по ${formatDay(to)}` }}
    </p>

    <div
      class="grid grid-cols-7 gap-1"
      role="grid"
      :aria-label="title"
    >
      <span
        v-for="d in WEEK"
        :key="d"
        class="t-small text-center"
      >{{ d }}</span>
      <template
        v-for="(day, i) in days"
        :key="day ?? `pad-${i}`"
      >
        <span v-if="!day" />
        <button
          v-else
          type="button"
          class="t-num flex h-16 items-center justify-center text-2xl"
          :class="[
            day > max ? 'cursor-not-allowed text-ink-soft/50' : inRange(day) ? 'bg-ink text-paper' : 'hover:bg-wash active:bg-ink active:text-paper',
            (day === from || day === to) && 'outline-[3px] -outline-offset-[6px] outline-paper',
          ]"
          :disabled="day > max"
          :aria-pressed="inRange(day)"
          :aria-label="formatDay(day)"
          @click="tap(day)"
        >
          {{ Number(day.slice(8)) }}
        </button>
      </template>
    </div>
  </div>
</template>
