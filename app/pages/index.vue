<script setup lang="ts">
import { ArrowRightLeft, ScanLine, Search } from '@lucide/vue'

const { data: health } = await useFetch('/api/health')
</script>

<template>
  <main class="flex flex-1 flex-col gap-6">
    <header class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">
        Склад
      </h1>
      <Badge
        v-if="health && !health.homeboxConfigured"
        variant="destructive"
      >
        Homebox не настроен
      </Badge>
    </header>

    <div class="grid flex-1 content-center gap-4 sm:grid-cols-3">
      <Button
        size="tile"
        as-child
      >
        <NuxtLink to="/scan">
          <ScanLine />
          Сканировать
        </NuxtLink>
      </Button>
      <Button
        size="tile"
        variant="secondary"
        as-child
      >
        <NuxtLink to="/search">
          <Search />
          Найти оборудование
        </NuxtLink>
      </Button>
      <Button
        size="tile"
        variant="secondary"
        as-child
      >
        <NuxtLink to="/search?intent=move">
          <ArrowRightLeft />
          Переместить
        </NuxtLink>
      </Button>
    </div>
  </main>
</template>
