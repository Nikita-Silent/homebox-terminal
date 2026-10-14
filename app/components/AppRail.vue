<script setup lang="ts">
import { Maximize, Minimize, ScanBarcode } from '@lucide/vue'

const { isFullscreen, toggle, isSupported } = useFullscreen()
</script>

<template>
  <header class="sticky top-0 z-30 bg-ink text-paper">
    <div class="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-8">
      <NuxtLink
        to="/"
        class="t-label text-2xl tracking-wide focus-visible:outline-paper"
      >
        Склад
      </NuxtLink>
      <span
        class="t-small hidden items-center gap-2 sm:flex"
        aria-live="polite"
      >
        <ScanBarcode
          class="size-5"
          :stroke-width="2.5"
        />
        Сканер слушает
      </span>
      <div class="ml-auto flex items-center gap-2">
        <button
          v-if="isSupported"
          type="button"
          class="t-label flex h-12 items-center gap-2 border-[3px] border-paper px-4 text-base hover:bg-paper hover:text-ink focus-visible:outline-paper"
          @click="toggle()"
        >
          <component
            :is="isFullscreen ? Minimize : Maximize"
            class="size-5"
            :stroke-width="2.5"
          />
          {{ isFullscreen ? 'Окно' : 'Во весь экран' }}
        </button>
      </div>
    </div>
  </header>
</template>
