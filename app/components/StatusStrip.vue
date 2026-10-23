<script setup lang="ts">
import { CircleAlert, Info, TriangleAlert } from '@lucide/vue'

/**
 * Status without colour: error = inverted strip, pending = diagonal hatch,
 * attention = cross-hatch, info = plain frame.
 */
const props = defineProps<{
  kind: 'error' | 'info' | 'pending' | 'attention'
  title?: string
  message: string
}>()

const icon = computed(() => ({ error: CircleAlert, info: Info, pending: null, attention: TriangleAlert })[props.kind])
</script>

<template>
  <div
    :role="kind === 'error' || kind === 'attention' ? 'alert' : 'status'"
    class="frame flex"
    :class="kind === 'error' ? 'bg-ink text-paper' : 'bg-paper'"
  >
    <div
      v-if="kind === 'pending' || kind === 'attention'"
      class="w-6 shrink-0 border-r-[3px] border-ink"
      :class="kind === 'pending' ? 'hatch-pending' : 'hatch-attention'"
      aria-hidden="true"
    />
    <div class="flex items-start gap-4 p-5">
      <OrbLoader
        v-if="kind === 'pending'"
        :size="28"
        class="mt-0.5"
        aria-hidden="true"
      />
      <component
        :is="icon"
        v-else-if="icon"
        class="mt-0.5 size-7 shrink-0"
        :stroke-width="2.5"
        aria-hidden="true"
      />
      <div>
        <p
          v-if="title"
          class="t-label text-2xl"
        >
          {{ title }}
        </p>
        <p class="text-lg font-medium">
          {{ message }}
        </p>
        <slot />
      </div>
    </div>
  </div>
</template>
