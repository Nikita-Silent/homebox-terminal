<script setup lang="ts">
import type { ItemDetail, LocationNode, TransferInput, TransferPreview, TransferResult } from '#shared/types/terminal'
import type { PickedLocation } from '~/components/LocationPicker.vue'
import { ArrowDown, ArrowRight, Check, RefreshCw, ScanBarcode } from '@lucide/vue'

const route = useRoute()
const id = computed(() => String(route.params.id))

const [{ data: item, error: itemError, refresh: refreshItem }, { data: tree, error: treeError, refresh: refreshTree }] = await Promise.all([
  useFetch<ItemDetail>(() => `/api/items/${id.value}`),
  useFetch<LocationNode[]>('/api/locations/tree'),
])

const { recent, remember } = useRecentLocations()

const target = ref<PickedLocation | null>(null)
const quantity = ref(1)
const mergeIntoId = ref<string | null>(null)
/** Several matching records: the user must pick one (or «separate») before confirming. */
const mergeDecided = ref(true)
const preview = ref<TransferPreview | null>(null)
const previewError = ref<ApiError | null>(null)
const previewLoading = ref(false)
const submitting = ref(false)
const submitError = ref<ApiError | null>(null)
const notice = ref<string | null>(null)
/** Kept across retries of the same confirmation, so a lost response never moves things twice. */
let opId: string | null = null

function reload() {
  return Promise.all([itemError.value && refreshItem(), treeError.value && refreshTree()])
}

const loadError = computed(() => (itemError.value || treeError.value ? toApiError(itemError.value ?? treeError.value) : null))
const currentId = computed(() => item.value?.location?.id ?? null)
const isPartial = computed(() => !!item.value && quantity.value < item.value.quantity)

function findLocation(locationId: string): PickedLocation | null {
  const walk = (nodes: LocationNode[], parents: string[]): PickedLocation | null => {
    for (const node of nodes) {
      const path = [...parents, node.name]
      if (node.id === locationId) return { id: node.id, name: node.name, path: path.join(' / ') }
      const found = walk(node.children, path)
      if (found) return found
    }
    return null
  }
  return walk(tree.value ?? [], [])
}

watch(item, (value) => {
  if (value && quantity.value > value.quantity) quantity.value = Math.max(1, value.quantity)
  if (value && value.quantity <= 1) quantity.value = value.quantity
}, { immediate: true })

watch(tree, () => {
  const to = typeof route.query.to === 'string' ? route.query.to : null
  if (to && !target.value) target.value = findLocation(to)
}, { immediate: true })

function chooseTarget(location: PickedLocation) {
  notice.value = null
  if (location.id === currentId.value) {
    notice.value = `Оборудование уже лежит в «${location.name}». Выберите другое место.`
    return
  }
  target.value = location
}

let previewSeq = 0
async function loadPreview() {
  preview.value = null
  previewError.value = null
  if (!item.value || !target.value) return
  const seq = ++previewSeq
  previewLoading.value = true
  try {
    const result = await $fetch<TransferPreview>('/api/transfers/preview', {
      method: 'POST',
      body: {
        itemId: item.value.id,
        targetLocationId: target.value.id,
        quantity: quantity.value,
        expectedQuantity: item.value.quantity,
        expectedLocationId: currentId.value,
      },
    })
    if (seq !== previewSeq) return
    preview.value = result
    mergeIntoId.value = result.suggestedMergeIntoId
    mergeDecided.value = result.mergeCandidates.length <= 1
    // The choice is the one thing left to do: bring it into view instead of leaving it off screen.
    if (!mergeDecided.value) nextTick(showMerge)
  }
  catch (e) {
    if (seq === previewSeq) previewError.value = toApiError(e)
  }
  finally {
    if (seq === previewSeq) previewLoading.value = false
  }
}

const debouncedPreview = useDebounceFn(loadPreview, 200)
watch([target, quantity, item], () => {
  opId = null
  debouncedPreview()
}, { immediate: true })
// A rejected move refreshes the card (and the preview); its reason must stay until the employee changes the move.
watch([target, quantity], () => {
  submitError.value = null
})

const mergeSection = ref<HTMLElement | null>(null)
function showMerge() {
  mergeSection.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

const mergeTarget = computed(() => preview.value?.mergeCandidates.find(c => c.id === mergeIntoId.value) ?? null)

const outcome = computed(() => {
  if (!preview.value || !item.value || !target.value) return null
  if (!mergeDecided.value) {
    return { title: 'Выберите запись на полке', detail: 'Там несколько подходящих записей — укажите, к какой добавить, или запишите отдельной строкой.' }
  }
  const left = item.value.quantity - quantity.value
  if (mergeTarget.value) {
    return {
      title: `Добавится к «${mergeTarget.value.name}»`,
      detail: `На полке станет ${mergeTarget.value.quantity} → ${mergeTarget.value.quantity + quantity.value} шт.`
        + (left > 0 ? ` Здесь останется ${left} шт.` : ' Пустая запись здесь будет удалена.'),
    }
  }
  if (isPartial.value) {
    return {
      title: 'Появится новая запись',
      detail: `${quantity.value} шт. с теми же данными и своим UID. Здесь останется ${left} шт.`,
    }
  }
  return { title: 'Запись переедет целиком', detail: 'UID, история и фото остаются при ней.' }
})

const canConfirm = computed(() => !!preview.value && mergeDecided.value && !previewLoading.value && !submitting.value)

async function confirm() {
  if (!canConfirm.value || !item.value || !target.value) return
  submitting.value = true
  submitError.value = null
  opId ??= uuidV4()
  const body: TransferInput = {
    opId,
    itemId: item.value.id,
    targetLocationId: target.value.id,
    quantity: quantity.value,
    expectedQuantity: item.value.quantity,
    expectedLocationId: currentId.value,
    mergeIntoId: mergeIntoId.value,
  }
  try {
    const result = await $fetch<TransferResult>('/api/transfers', { method: 'POST', body })
    useState<TransferResult | null>(`transfer:${result.opId}`).value = result
    if (result.status !== 'failed') remember({ id: target.value.id, name: target.value.name, path: target.value.path })
    await navigateTo(`/result/${result.opId}`)
  }
  catch (e) {
    const err = toApiError(e)
    submitError.value = err
    // A definite rejection means nothing changed: the next attempt is a new operation.
    if (err.code !== 'NETWORK') opId = null
    if (err.code === 'STALE') await refreshItem()
  }
  finally {
    submitting.value = false
  }
}

/** Scanner on this screen: a shelf label picks the target, an item label opens that item. */
useScanner(async (code) => {
  notice.value = null
  try {
    const found = await lookupCode(code)
    if (found.location) {
      const location = findLocation(found.location.id)
      if (location) chooseTarget(location)
      return
    }
    if (found.items.length === 1 && found.items[0]!.id !== id.value) {
      await navigateTo(`/item/${found.items[0]!.id}`)
      return
    }
    notice.value = `Код «${code}» — это не этикетка полки`
  }
  catch (e) {
    notice.value = toApiError(e).message
  }
})
</script>

<template>
  <div class="flex flex-col gap-8 short:gap-5">
    <BackLink :to="`/item/${id}`">
      К карточке
    </BackLink>

    <StatusStrip
      v-if="loadError"
      kind="error"
      title="Не удалось загрузить"
      :message="loadError.message"
    >
      <Button
        variant="outline"
        size="touch"
        class="mt-4 border-paper"
        @click="reload()"
      >
        <RefreshCw />
        Повторить
      </Button>
    </StatusStrip>

    <template v-else-if="item && tree">
      <header class="frame grid grid-cols-[1fr_auto] overflow-hidden bg-paper">
        <div class="flex min-w-0 items-stretch">
          <ItemPhoto
            :item="item"
            decorative
            class="w-24 shrink-0 border-r-[3px] border-ink bg-wash object-cover sm:w-32"
          />
          <h1 class="t-label min-w-0 self-center px-5 pt-4 pb-3 text-3xl break-words sm:text-5xl short:sm:text-4xl">
            {{ item.name }}
          </h1>
        </div>
        <p class="t-num border-l-[3px] border-ink px-4 py-4 text-5xl sm:row-span-2 sm:px-5 sm:text-6xl short:sm:text-5xl">
          {{ item.quantity }}<span class="t-small ml-1 align-top">шт</span>
        </p>
        <dl class="rule col-span-2 px-5 py-3 sm:col-span-1">
          <dt class="t-small">
            Откуда
          </dt>
          <dd class="text-lg font-semibold">
            {{ pathText(item.locationPath) || 'Без локации' }}
          </dd>
        </dl>
      </header>

      <StatusStrip
        v-if="notice"
        kind="info"
        :message="notice"
      />

      <section
        v-if="item.quantity > 1"
        aria-labelledby="qty-heading"
        class="flex flex-col gap-3"
      >
        <h2
          id="qty-heading"
          class="t-label text-3xl"
        >
          Сколько
        </h2>
        <QuantityStepper
          v-model="quantity"
          :max="item.quantity"
        />
      </section>

      <section
        aria-labelledby="where-heading"
        class="flex flex-col gap-3"
      >
        <div class="flex flex-wrap items-end justify-between gap-3">
          <h2
            id="where-heading"
            class="t-label text-3xl"
          >
            Куда
          </h2>
          <p class="flex items-center gap-2 text-lg font-medium">
            <ScanBarcode
              class="size-6"
              :stroke-width="2.5"
            />
            Отсканируйте этикетку полки или выберите ниже
          </p>
        </div>

        <div
          v-if="recent.length"
          class="flex flex-wrap gap-3"
          aria-label="Недавние места"
        >
          <button
            v-for="place in recent.filter(r => r.id !== currentId)"
            :key="place.id"
            type="button"
            class="frame flex min-h-16 flex-col items-start justify-center px-4 py-2 text-left"
            :class="target?.id === place.id ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash active:bg-ink active:text-paper'"
            @click="chooseTarget(place)"
          >
            <span class="text-sm font-medium">{{ place.path.split(' / ').slice(0, -1).join(' / ') }}</span>
            <span class="t-label text-2xl">{{ place.name }}</span>
          </button>
        </div>

        <LocationPicker
          v-model="target"
          :tree="tree"
          :current-id="currentId"
        />
      </section>


      <section
        v-if="preview?.mergeCandidates.length"
        ref="mergeSection"
        aria-labelledby="merge-heading"
        class="flex scroll-mt-24 flex-col gap-3"
      >
        <h2
          id="merge-heading"
          class="t-label text-3xl"
        >
          На полке уже есть такой товар
        </h2>
        <p
          v-if="!preview.suggestedMergeIntoId"
          class="text-lg font-medium"
          :class="!mergeDecided && 'hatch-attention border-[3px] border-ink p-2'"
        >
          <span :class="!mergeDecided && 'inline-block bg-paper px-3 py-2'">Подходящих записей несколько — выберите, к какой добавить.</span>
        </p>
        <div
          class="grid gap-3 md:grid-cols-2"
          role="radiogroup"
          aria-labelledby="merge-heading"
        >
          <button
            v-for="candidate in preview.mergeCandidates"
            :key="candidate.id"
            type="button"
            role="radio"
            :aria-checked="mergeDecided && mergeIntoId === candidate.id"
            class="frame flex min-h-24 items-center gap-4 px-5 py-4 text-left"
            :class="mergeDecided && mergeIntoId === candidate.id ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash'"
            @click="mergeIntoId = candidate.id; mergeDecided = true"
          >
            <span class="min-w-0 flex-1">
              <span class="t-label block text-2xl break-words">Добавить к «{{ candidate.name }}»</span>
              <span class="text-lg font-medium">
                <template v-if="candidate.assetId">UID {{ candidate.assetId }} · </template>{{ candidate.quantity }} → {{ candidate.quantity + quantity }} шт.
              </span>
            </span>
            <Check
              v-if="mergeDecided && mergeIntoId === candidate.id"
              class="size-8 shrink-0"
              :stroke-width="3"
            />
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="mergeDecided && mergeIntoId === null"
            class="frame flex min-h-24 items-center gap-4 px-5 py-4 text-left"
            :class="mergeDecided && mergeIntoId === null ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash'"
            @click="mergeIntoId = null; mergeDecided = true"
          >
            <span class="min-w-0 flex-1">
              <span class="t-label block text-2xl">Записать отдельной строкой</span>
              <span class="text-lg font-medium">{{ isPartial ? 'Новая запись со своим UID' : 'Запись переедет целиком' }}</span>
            </span>
            <Check
              v-if="mergeDecided && mergeIntoId === null"
              class="size-8 shrink-0"
              :stroke-width="3"
            />
          </button>
        </div>
      </section>

      <!-- States the exact outcome before the tap. -->
      <ConfirmBar>
        <template v-if="!target">
          <p class="t-label text-xl sm:text-2xl">
            Выберите, куда переместить
          </p>
          <p class="hidden text-lg sm:block">
            Отсканируйте полку или выберите её в списке.
          </p>
        </template>
        <template v-else>
          <!-- The whole way to the shelf, never cut: «Полка 01» exists in every warehouse. -->
          <p class="flex flex-wrap items-center gap-x-3 text-lg font-semibold">
            <span class="t-num shrink-0 text-3xl sm:text-4xl">{{ quantity }} шт.</span>
            <ArrowRight
              class="size-6 shrink-0"
              :stroke-width="3"
            />
            <span class="t-label min-w-0 text-2xl break-words sm:text-3xl">{{ target.name }}</span>
          </p>
          <p
            v-if="target.path.includes(' / ')"
            class="text-base font-semibold break-words sm:text-lg"
            data-target-path
          >
            {{ target.path.split(' / ').slice(0, -1).join(' / ') }}
          </p>
          <p
            v-if="previewLoading"
            class="mt-1 flex items-center gap-2 text-lg"
          >
            <OrbLoader
              :size="28"
              label="Загрузка"
            />
            Проверяем по Homebox…
          </p>
          <button
            v-else-if="outcome && !mergeDecided"
            type="button"
            class="hatch-attention mt-1 flex min-h-16 w-full items-center border-[3px] border-ink p-1.5 text-left text-base sm:text-lg"
            @click="showMerge"
          >
            <span class="flex items-center gap-2 bg-paper px-2 py-1"><strong class="font-bold">{{ outcome.title }}</strong>
              <ArrowDown
                class="size-5 shrink-0"
                :stroke-width="3"
              />
            </span>
          </button>
          <p
            v-else-if="outcome"
            class="mt-1 text-base sm:text-lg"
          >
            <strong class="font-bold">{{ outcome.title }}.</strong> <span class="hidden sm:inline">{{ outcome.detail }}</span>
          </p>
        </template>
        <StatusStrip
          v-if="previewError || submitError"
          class="mt-3"
          kind="error"
          :message="(submitError ?? previewError)!.message"
        />
        <template #action>
          <Button
            size="touch"
            class="h-16 w-full text-2xl sm:h-20 lg:w-auto lg:min-w-80 short:lg:min-w-64"
            :disabled="!canConfirm"
            @click="confirm"
          >
            <OrbLoader
              v-if="submitting"
              :size="28"
              label="Загрузка"
            />
            <Check v-else />
            {{ submitting ? 'Перемещаем…' : submitError?.code === 'NETWORK' ? 'Повторить' : 'Подтвердить' }}
          </Button>
        </template>
      </ConfirmBar>
    </template>

    <LoadingBlock
      v-else
      text="Готовим перемещение…"
    />
  </div>
</template>
