<script setup lang="ts">
import type { LocationContents } from '#shared/types/terminal'
import { ArrowLeft } from '@lucide/vue'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, error, refresh, status } = await useFetch<LocationContents>(() => `/api/locations/${id.value}`)
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
const parent = computed(() => data.value?.path.at(-2) ?? null)
const notice = ref<string | null>(null)
useBrowseScanner((message) => {
  notice.value = message
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <NuxtLink
      :to="parent ? `/browse/${parent.id}` : '/browse'"
      class="t-label flex w-fit items-center gap-2 text-xl hover:underline hover:decoration-[3px] hover:underline-offset-4"
    >
      <ArrowLeft
        class="size-6"
        :stroke-width="2.5"
      />
      {{ parent ? parent.name : 'Все склады' }}
    </NuxtLink>

    <StatusStrip
      v-if="apiError"
      kind="error"
      :title="apiError.code === 'NOT_FOUND' ? 'Место не найдено' : 'Не удалось загрузить'"
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
      v-else-if="!data || status === 'pending'"
      class="frame hatch-pending h-64"
      aria-busy="true"
    />

    <template v-else>
      <header>
        <nav
          v-if="data.path.length > 1"
          class="flex flex-wrap items-center gap-x-2 text-lg font-semibold"
          aria-label="Путь"
        >
          <template
            v-for="(step, i) in data.path.slice(0, -1)"
            :key="step.id"
          >
            <span v-if="i">/</span>
            <NuxtLink
              :to="`/browse/${step.id}`"
              class="underline decoration-2 underline-offset-4"
            >{{ step.name }}</NuxtLink>
          </template>
        </nav>
        <h1 class="t-label text-5xl break-words sm:text-7xl">
          {{ data.location.name }}
        </h1>
      </header>

      <StatusStrip
        v-if="notice"
        kind="info"
        :message="notice"
      />

      <section
        v-if="data.sublocations.length"
        aria-labelledby="inside-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="inside-heading"
          class="t-label text-3xl"
        >
          Внутри
        </h2>
        <LocationRow
          v-for="place in data.sublocations"
          :key="place.id"
          :to="`/browse/${place.id}`"
          :name="place.name"
        />
      </section>

      <section
        v-if="data.items.length || !data.sublocations.length"
        aria-labelledby="items-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="items-heading"
          class="t-label text-3xl"
        >
          Оборудование здесь · {{ data.items.length }}
        </h2>
        <ItemRow
          v-for="item in data.items"
          :key="item.id"
          :item="item"
        />
        <div
          v-if="!data.items.length"
          class="frame unavailable p-6"
        >
          <p class="t-label text-2xl">
            Здесь ничего не лежит
          </p>
        </div>
      </section>
    </template>
  </div>
</template>
