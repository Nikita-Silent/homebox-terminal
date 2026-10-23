<script setup lang="ts">
/**
 * The screen's confirmation, fixed to the bottom edge so it is always in reach.
 * A spacer of the bar's own height keeps the end of the page clear of it.
 */
const bar = ref<HTMLElement | null>(null)
const { height } = useElementSize(bar, undefined, { box: 'border-box' })
/** While the on-screen keyboard is up it owns the bottom edge; the bar comes back when it hides. */
const keyboardOpen = useState('touch-keyboard:open', () => false)
</script>

<template>
  <div
    aria-hidden="true"
    :style="{ height: `${height}px` }"
  />
  <div
    v-show="!keyboardOpen"
    ref="bar"
    class="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-paper"
  >
    <div class="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4 lg:flex-row lg:items-center short:sm:py-3">
      <div class="min-w-0 flex-1">
        <slot />
      </div>
      <slot name="action" />
    </div>
  </div>
</template>
