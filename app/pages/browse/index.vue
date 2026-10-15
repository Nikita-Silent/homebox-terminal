<script setup lang="ts">
import type { LocationNode } from '#shared/types/terminal'
import { ArrowLeft, List } from '@lucide/vue'

const { data: tree, error, refresh } = await useFetch<LocationNode[]>('/api/locations/tree')
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
const notice = ref<string | null>(null)
useBrowseScanner((message) => {
  notice.value = message
})

const roots = computed(() => [...(tree.value ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true })))
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      to="/"
      class="t-label flex w-fit items-center gap-2 text-xl hover:underline hover:decoration-[3px] hover:underline-offset-4"
    >
      <ArrowLeft
        class="size-6"
        :stroke-width="2.5"
      />
      К поиску
    </NuxtLink>

    <h1 class="t-label text-4xl sm:text-6xl">
      Выберите, где искать
    </h1>
    <p class="-mt-3 text-lg">
      Откройте склад и полку — там будет список оборудования. Можно отсканировать этикетку полки.
    </p>

    <StatusStrip
      v-if="notice"
      kind="info"
      :message="notice"
    />

    <Button
      as-child
      size="touch"
      class="h-20 justify-start text-2xl"
    >
      <NuxtLink to="/browse/all">
        <List />
        Всё оборудование по алфавиту
      </NuxtLink>
    </Button>

    <StatusStrip
      v-if="apiError"
      kind="error"
      title="Не удалось загрузить склады"
      :message="apiError.message"
    >
      <Button
        variant="outline"
        size="lg"
        class="mt-4"
        @click="refresh()"
      >
        Повторить
      </Button>
    </StatusStrip>

    <div
      v-else-if="!tree"
      class="frame hatch-pending h-64"
      aria-busy="true"
    />

    <nav
      v-else
      class="flex flex-col gap-3"
      aria-label="Склады"
    >
      <LocationRow
        v-for="node in roots"
        :key="node.id"
        :to="`/browse/${node.id}`"
        :name="node.name"
        :hint="node.children.length ? `Внутри: ${node.children.length}` : undefined"
      />
    </nav>
  </div>
</template>
