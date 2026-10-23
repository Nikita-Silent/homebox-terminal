<script setup lang="ts">
import type { ItemDetail } from '#shared/types/terminal'
import { ArrowRightLeft, Check, Expand, RefreshCw, ShoppingBasket, Warehouse } from '@lucide/vue'

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: item, error, status, refresh } = await useFetch<ItemDetail>(() => `/api/items/${id.value}`)
const apiError = computed(() => (error.value ? toApiError(error.value) : null))
const shelf = computed(() => item.value?.locationPath.at(-1) ?? null)
const parents = computed(() => item.value?.locationPath.slice(0, -1) ?? [])
const notice = ref<string | null>(null)
const imageFailed = ref(false)
const cart = useCart()

function addToCart(value: ItemDetail) {
  notice.value = cart.add(value) === 'full' ? `В корзине уже ${CART_LIMIT} позиций — сначала переместите их` : null
}
const photoOpen = ref(false)

/** Back to where the card was opened from: the search with its query, a shelf, the catalogue. */
const previous = (window.history.state as { back?: string | null } | null)?.back ?? null
const { load: loadTree, pathTo } = useLocationTree()
onMounted(() => loadTree())
const back = computed(() => backTarget(previous, shelf.value, placeId => pathTo(placeId)?.at(-1)?.name ?? null))

/** Scanning a shelf here jumps straight to the move screen with that shelf chosen. */
useScanner(async (code) => {
  notice.value = null
  try {
    const found = await lookupCode(code)
    if (found.location) {
      await navigateTo(`/item/${id.value}/move?to=${found.location.id}`)
    }
    else if (found.items.length === 1) {
      await navigateTo(`/item/${found.items[0]!.id}`)
    }
    else {
      notice.value = `Код «${code}» не найден в Homebox`
    }
  }
  catch (e) {
    notice.value = toApiError(e).message
  }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <BackLink :to="back.to">
      {{ back.label }}
    </BackLink>

    <div
      v-if="status === 'pending' && !item"
      class="frame hatch-pending h-96"
      aria-busy="true"
    />

    <StatusStrip
      v-else-if="apiError"
      kind="error"
      :title="apiError.code === 'NOT_FOUND' ? 'Оборудование не найдено' : 'Не удалось загрузить'"
      :message="apiError.message"
    >
      <Button
        variant="outline"
        size="lg"
        class="mt-4 border-paper"
        @click="refresh()"
      >
        <RefreshCw />
        Повторить
      </Button>
    </StatusStrip>

    <template v-else-if="item">
      <StatusStrip
        v-if="notice"
        kind="info"
        :message="notice"
      />

      <article class="frame bg-paper">
        <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-ink px-5 py-3 text-paper">
          <span class="t-label text-xl">{{ item.quantity > 1 ? 'Количественный учёт' : 'Поштучный учёт' }}</span>
          <span
            v-if="item.assetId"
            class="t-num text-2xl whitespace-nowrap sm:text-3xl"
          >UID {{ item.assetId }}</span>
        </header>

        <div class="grid gap-0 lg:grid-cols-[1fr_auto]">
          <div class="flex flex-col">
            <h1 class="t-label px-5 pt-5 pb-4 text-4xl break-words sm:text-6xl short:sm:text-5xl">
              {{ item.name }}
            </h1>

            <dl class="rule grid grid-cols-2 sm:grid-cols-3">
              <div
                v-if="item.manufacturer"
                class="border-r border-ink px-5 py-3"
              >
                <dt class="t-small">
                  Производитель
                </dt>
                <dd class="text-xl font-semibold">
                  {{ item.manufacturer }}
                </dd>
              </div>
              <div
                v-if="item.modelNumber"
                class="border-r border-ink px-5 py-3"
              >
                <dt class="t-small">
                  Модель
                </dt>
                <dd class="text-xl font-semibold">
                  {{ item.modelNumber }}
                </dd>
              </div>
              <div
                v-if="item.serialNumber"
                class="px-5 py-3"
              >
                <dt class="t-small">
                  Серийный номер
                </dt>
                <dd class="text-xl font-semibold break-all">
                  {{ item.serialNumber }}
                </dd>
              </div>
            </dl>

            <div class="rule grid sm:grid-cols-[1fr_auto]">
              <div class="px-5 py-4">
                <p class="t-small">
                  Где лежит
                </p>
                <p
                  v-if="parents.length"
                  class="mt-1 text-xl font-semibold"
                >
                  {{ pathText(parents) }}
                </p>
                <p class="t-label mt-1 text-5xl break-words sm:text-6xl short:sm:text-5xl">
                  {{ shelf?.name ?? 'Без локации' }}
                </p>
                <NuxtLink
                  v-if="shelf"
                  :to="`/browse/${shelf.id}`"
                  class="t-label -mb-2 mt-1 flex min-h-16 w-fit items-center gap-2 pr-4 text-lg underline decoration-2 underline-offset-4 hover:bg-wash active:bg-ink active:text-paper"
                >
                  <Warehouse
                    class="size-6"
                    :stroke-width="2.5"
                  />
                  Что ещё на этом месте
                </NuxtLink>
              </div>
              <div class="flex items-end justify-between gap-4 border-t-[3px] border-ink px-5 py-4 sm:flex-col sm:items-end sm:justify-end sm:border-t-0 sm:border-l-[3px]">
                <p class="t-small">
                  В наличии
                </p>
                <p class="t-num text-7xl sm:text-8xl short:sm:text-7xl">
                  {{ item.quantity }}<span class="t-label ml-2 text-xl sm:ml-0 sm:block sm:text-right">шт.</span>
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="item.hasImage && !imageFailed"
            class="border-t-[3px] border-ink lg:w-80 lg:border-t-0 lg:border-l-[3px]"
          >
            <button
              type="button"
              class="group relative block h-full w-full"
              aria-label="Открыть фото во весь экран"
              @click="photoOpen = true"
            >
              <ItemPhoto
                :item="item"
                size="full"
                class="aspect-[4/3] h-full w-full bg-wash object-cover lg:aspect-square"
                @failed="imageFailed = true"
              />
              <span class="t-label absolute right-3 bottom-3 flex items-center gap-2 bg-ink px-3 py-2 text-base text-paper group-hover:bg-paper group-hover:text-ink">
                <Expand
                  class="size-5"
                  :stroke-width="2.5"
                />
                Увеличить
              </span>
            </button>
          </div>
        </div>
      </article>

      <PhotoViewer
        v-if="photoOpen"
        :item="item"
        @close="photoOpen = false"
      />

      <!-- The two things to do with a card stay at the bottom edge, whatever the name and the photo take. -->
      <ConfirmBar>
        <p class="text-base text-ink-soft sm:text-lg">
          Или отсканируйте этикетку полки — сразу откроется перемещение.
        </p>
        <template #action>
          <div class="grid grid-cols-[3fr_2fr] gap-3 lg:flex">
            <Button
              as-child
              size="touch"
              class="h-20 text-2xl sm:text-3xl lg:min-w-80"
            >
              <NuxtLink :to="`/item/${item.id}/move`">
                <ArrowRightLeft class="size-8" />
                Переместить
              </NuxtLink>
            </Button>
            <Button
              v-if="!cart.has(item.id)"
              variant="outline"
              size="touch"
              class="h-20 text-xl sm:text-2xl lg:min-w-64"
              @click="addToCart(item)"
            >
              <ShoppingBasket class="size-7" />
              В корзину
            </Button>
            <Button
              v-else
              as-child
              variant="outline"
              size="touch"
              class="h-20 text-xl whitespace-normal sm:text-2xl lg:min-w-64"
            >
              <NuxtLink to="/cart">
                <Check class="size-7" />
                В корзине · открыть
              </NuxtLink>
            </Button>
          </div>
        </template>
      </ConfirmBar>
    </template>
  </div>
</template>
