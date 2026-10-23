<script setup lang="ts">
import type { ItemDetail, LocationNode, TransferInput, TransferPreview, TransferResult } from '#shared/types/terminal'
import type { PickedLocation } from '~/components/LocationPicker.vue'
import type { CartLine } from '~/composables/useCart'
import { ArrowDown, ArrowRight, Check, Pencil, RotateCcw, ScanBarcode, Search, Trash2, X } from '@lucide/vue'

/** Per-line state that is not worth persisting: it is rebuilt from Homebox whenever the cart opens. */
interface LineState {
  preview: TransferPreview | null
  error: ApiError | null
  loading: boolean
  mergeIntoId: string | null
  /** Several matching records at the target: the employee must choose before moving. */
  decided: boolean
  /** Kept across retries after a lost response, so a line is never moved twice. */
  opId: string | null
  moving: boolean
}

const { lines, count, add, remove, clear, restore } = useCart()
const { recent, remember } = useRecentLocations()
const { data: tree } = await useFetch<LocationNode[]>('/api/locations/tree')

const target = ref<PickedLocation | null>(null)
const notice = ref<string | null>(null)
const highlighted = ref<string | null>(null)
const state = reactive<Record<string, LineState>>({})
const moving = ref(false)
const finished = ref<TransferResult[]>([])

function forget(itemId: string) {
  remove(itemId)
  Reflect.deleteProperty(state, itemId)
}

// ── Undo: a stray tap on «×» or «Очистить» must not cost the whole collection ─

const UNDO_MS = 10_000
const undo = ref<{ before: CartLine[], message: string } | null>(null)
let undoTimer: ReturnType<typeof setTimeout> | undefined

function offerUndo(message: string) {
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => {
    undo.value = null
  }, UNDO_MS)
  undo.value = { before: undo.value?.before ?? [...lines.value], message }
}

function removeLine(line: CartLine) {
  offerUndo(`Убрано: «${line.item.name}»`)
  forget(line.item.id)
}

function clearAll() {
  offerUndo(`Корзина очищена: ${count.value} поз.`)
  clear()
  finished.value = []
}

function undoRemoval() {
  if (!undo.value) return
  restore(undo.value.before)
  undo.value = null
  clearTimeout(undoTimer)
}
onBeforeUnmount(() => clearTimeout(undoTimer))

/** Quantity editors are opened one line at a time; closed lines are a single compact row. */
const editing = ref<string | null>(null)

function lineState(itemId: string): LineState {
  state[itemId] ??= { preview: null, error: null, loading: false, mergeIntoId: null, decided: true, opId: null, moving: false }
  return state[itemId]
}

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

/** What the employee sees must be what Homebox has now: re-read every item when the cart opens. */
async function refreshItems() {
  const gone: string[] = []
  await Promise.all(lines.value.map(async (line) => {
    try {
      const fresh = await $fetch<ItemDetail>(`/api/items/${line.item.id}`)
      line.item = fresh
      if (line.quantity > fresh.quantity) line.quantity = Math.max(1, fresh.quantity)
      if (fresh.quantity <= 1) line.quantity = fresh.quantity
    }
    catch (e) {
      if (toApiError(e).code === 'NOT_FOUND') gone.push(line.item.name)
    }
  }))
  if (gone.length) {
    lines.value = lines.value.filter(line => !gone.includes(line.item.name))
    notice.value = `Убрано из корзины, в Homebox больше нет: ${gone.join(', ')}`
  }
}
onMounted(refreshItems)

// ── Preview of every line against the chosen place ──────────────────────────

let previewSeq = 0
async function previewAll() {
  // Lines leave the cart while moving; the remaining ones are re-checked once the run ends.
  if (moving.value) return
  const seq = ++previewSeq
  const place = target.value
  for (const line of lines.value) {
    const s = lineState(line.item.id)
    s.preview = null
    s.error = null
    s.opId = null
  }
  if (!place) return
  await Promise.all(lines.value.map(async (line) => {
    const s = lineState(line.item.id)
    s.loading = true
    try {
      const preview = await $fetch<TransferPreview>('/api/transfers/preview', {
        method: 'POST',
        body: {
          itemId: line.item.id,
          targetLocationId: place.id,
          quantity: line.quantity,
          expectedQuantity: line.item.quantity,
          expectedLocationId: line.item.location?.id ?? null,
        },
      })
      if (seq !== previewSeq) return
      s.preview = preview
      s.mergeIntoId = preview.suggestedMergeIntoId
      s.decided = preview.mergeCandidates.length <= 1
    }
    catch (e) {
      if (seq === previewSeq) s.error = toApiError(e)
    }
    finally {
      if (seq === previewSeq) s.loading = false
    }
  }))
}

const debouncedPreview = useDebounceFn(previewAll, 250)
watch(
  () => [target.value?.id, lines.value.map(l => `${l.item.id}:${l.quantity}:${l.item.quantity}`).join(',')],
  () => debouncedPreview(),
)

function chooseTarget(place: PickedLocation) {
  notice.value = null
  finished.value = []
  target.value = place
}

function outcome(line: CartLine) {
  const s = lineState(line.item.id)
  if (!s.preview) return ''
  if (!s.decided) return 'На полке несколько таких записей — выберите, к какой добавить'
  const into = s.preview.mergeCandidates.find(c => c.id === s.mergeIntoId)
  if (into) return `Добавится к записи${into.assetId ? ` UID ${into.assetId}` : ''}: ${into.quantity} → ${into.quantity + line.quantity} шт.`
  return line.quantity < line.item.quantity ? 'Появится новая запись со своим UID' : 'Запись переедет целиком'
}

const pieces = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0))
const blocked = computed(() => lines.value.filter((line) => {
  const s = lineState(line.item.id)
  return s.loading || !s.preview || !s.decided || !!s.error
}))
/** «Проверьте строк: N» leads to them: each tap goes to the next line that needs a look. */
let blockedTurn = 0
function showBlocked() {
  const ids = blocked.value.map(line => line.item.id)
  if (!ids.length) return
  const id = ids[blockedTurn++ % ids.length]!
  flash(id)
}

function flash(id: string) {
  highlighted.value = id
  setTimeout(() => {
    if (highlighted.value === id) highlighted.value = null
  }, 2000)
  nextTick(() => document.getElementById(`line-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}

const whereSection = ref<HTMLElement | null>(null)
const showWhere = () => whereSection.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })

const canMove = computed(() => !!target.value && lines.value.length > 0 && !blocked.value.length && !moving.value)

// ── Moving: one ordinary transfer per line, one after another ───────────────

async function moveAll() {
  if (!canMove.value || !target.value) return
  moving.value = true
  notice.value = null
  const place = target.value
  const done: TransferResult[] = []

  for (const line of [...lines.value]) {
    const s = lineState(line.item.id)
    s.moving = true
    s.opId ??= uuidV4()
    const body: TransferInput = {
      opId: s.opId,
      itemId: line.item.id,
      targetLocationId: place.id,
      quantity: line.quantity,
      expectedQuantity: line.item.quantity,
      expectedLocationId: line.item.location?.id ?? null,
      mergeIntoId: s.mergeIntoId,
    }
    try {
      const result = await $fetch<TransferResult>('/api/transfers', { method: 'POST', body })
      useState<TransferResult | null>(`transfer:${result.opId}`).value = result
      if (result.status === 'failed') {
        s.error = { code: 'INTERNAL', message: result.message ?? 'Не выполнено' }
        s.opId = null
      }
      else {
        done.push(result)
        forget(line.item.id)
      }
    }
    catch (e) {
      s.error = toApiError(e)
      // A definite rejection changed nothing: a retry is a new operation.
      if (s.error.code !== 'NETWORK') s.opId = null
    }
    finally {
      s.moving = false
    }
  }

  moving.value = false
  undo.value = null
  finished.value = done
  if (done.length) remember({ id: place.id, name: place.name, path: place.path })
  if (lines.value.length) {
    const reasons = lines.value.map(line => `«${line.item.name}» — ${lineState(line.item.id).error?.message ?? 'не выполнено'}`)
    // What failed is re-read and re-checked, so the employee sees today's numbers before retrying.
    await refreshItems()
    await previewAll()
    const moved = done.filter(r => r.status === 'done').length
    notice.value = `Перемещено ${moved} из ${done.length + reasons.length}. Не перемещено: ${reasons.join('; ')}`
  }
}

// ── Scanner: equipment goes into the cart, a shelf label becomes the target ─

useScanner(async (code) => {
  notice.value = null
  try {
    const found = await lookupCode(code)
    if (found.location) {
      const place = findLocation(found.location.id)
      if (place) chooseTarget(place)
      return
    }
    if (found.items.length === 1) {
      const item = found.items[0]!
      const result = add(item)
      finished.value = []
      if (result === 'full') notice.value = `В корзине уже ${CART_LIMIT} позиций — переместите их, потом добавляйте ещё`
      flash(item.id)
      if (result === 'exists') notice.value = `«${item.name}» уже в корзине`
      return
    }
    notice.value = found.items.length
      ? `По коду «${code}» нашлось несколько записей — откройте нужную через поиск и добавьте из карточки`
      : `Код «${code}» не найден в Homebox`
  }
  catch (e) {
    notice.value = toApiError(e).message
  }
})

const placeParents = (place: PickedLocation) => place.path.split(' / ').slice(0, -1).join(' / ')

/** The outcome of a run, by what really happened: only `done` is moved. */
const FINISHED = [
  { status: 'done', title: 'Перемещено', header: 'bg-ink text-paper' },
  { status: 'pending', title: 'Завершается', header: 'hatch-pending border-b-[3px] border-ink' },
  { status: 'needs_attention', title: 'Нужна проверка', header: 'hatch-attention border-b-[3px] border-ink' },
] as const
const finishedGroups = computed(() => FINISHED
  .map(group => ({ ...group, results: finished.value.filter(r => r.status === group.status) }))
  .filter(group => group.results.length))
</script>

<template>
  <div class="flex flex-col gap-8 short:gap-5">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h1 class="t-label text-4xl sm:text-6xl short:sm:text-5xl">
        Корзина
      </h1>
      <div
        v-if="count && !moving"
        class="flex flex-wrap gap-3"
      >
        <Button
          as-child
          variant="outline"
          size="touch"
        >
          <NuxtLink to="/">
            <Search />
            Добавить через поиск
          </NuxtLink>
        </Button>
        <Button
          variant="outline"
          size="touch"
          @click="clearAll"
        >
          <Trash2 />
          Очистить
        </Button>
      </div>
    </div>

    <!-- Under the rail, so it is in reach wherever the removal happened. -->
    <div
      v-if="undo"
      class="frame sticky top-16 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 bg-ink py-2 pr-2 pl-5 text-paper"
      role="status"
    >
      <span class="min-w-0 flex-1 text-lg font-semibold break-words">{{ undo.message }}</span>
      <button
        type="button"
        class="t-label flex h-16 items-center gap-2 border-[3px] border-paper px-5 text-xl hover:bg-paper hover:text-ink active:bg-paper active:text-ink focus-visible:outline-paper"
        @click="undoRemoval"
      >
        <RotateCcw
          class="size-6"
          :stroke-width="2.5"
        />
        Вернуть
      </button>
    </div>

    <p class="flex items-center gap-3 text-lg font-medium">
      <ScanBarcode
        class="size-7 shrink-0"
        :stroke-width="2.5"
      />
      Сканируйте оборудование — оно добавится сюда. Этикетка полки задаёт, куда переместить всё сразу.
    </p>

    <StatusStrip
      v-if="notice"
      kind="info"
      :message="notice"
    />

    <section
      v-for="group in finishedGroups"
      :key="group.status"
      class="frame bg-paper"
      :aria-label="group.title"
    >
      <p
        class="flex items-center gap-3 px-5 py-3"
        :class="group.header"
      >
        <span
          class="t-label flex items-center gap-3 text-3xl"
          :class="group.status !== 'done' && 'frame bg-paper px-3 py-1'"
        >
          <Check
            v-if="group.status === 'done'"
            class="size-8"
            :stroke-width="3.5"
          />
          {{ group.title }}: {{ group.results.length }}
        </span>
      </p>
      <p
        v-if="group.status === 'needs_attention'"
        class="rule-thin px-5 py-3 text-lg"
      >
        Откройте каждую строку: там видно, что проверить в Homebox.
      </p>
      <NuxtLink
        v-for="result in group.results"
        :key="result.opId"
        :to="`/result/${result.opId}`"
        class="rule-thin flex min-h-16 flex-wrap items-baseline gap-x-3 px-5 py-3 text-lg font-semibold hover:bg-wash active:bg-ink active:text-paper"
      >
        <span class="t-label text-2xl">{{ result.source.name }}</span>
        <span class="t-num text-2xl">{{ result.quantity }} шт.</span>
        <span>→ {{ result.target?.location?.name ?? '—' }}</span>
        <span
          v-if="result.target?.assetId"
          class="text-ink-soft"
        >UID {{ result.target.assetId }}</span>
        <span
          v-if="result.status !== 'done'"
          class="ml-auto flex items-center gap-1"
        >Подробнее <ArrowRight
          class="size-5"
          :stroke-width="2.5"
        /></span>
      </NuxtLink>
    </section>

    <div
      v-if="!count && !finished.length"
      class="frame unavailable p-6"
    >
      <p class="t-label text-3xl">
        Корзина пуста
      </p>
      <p class="mt-2 text-lg">
        Отсканируйте этикетки оборудования здесь или нажмите «В корзину» в карточке.
      </p>
      <Button
        as-child
        variant="outline"
        size="touch"
        class="mt-4"
      >
        <NuxtLink to="/">
          <Search />
          К поиску
        </NuxtLink>
      </Button>
    </div>

    <section
      v-if="count"
      class="flex flex-col gap-2"
      aria-label="Что переместить"
    >
      <article
        v-for="line in lines"
        :id="`line-${line.item.id}`"
        :key="line.item.id"
        class="frame scroll-mt-24 bg-paper"
        :class="[
          highlighted === line.item.id && 'outline-[4px] outline-offset-3 outline-ink',
          target && blocked.includes(line) && !lineState(line.item.id).loading && 'border-[5px]',
        ]"
      >
        <div class="flex items-stretch">
          <ItemPhoto
            :item="line.item"
            decorative
            class="w-16 shrink-0 border-r-[3px] border-ink bg-wash object-cover sm:w-24"
          />
          <div class="min-w-0 flex-1 px-4 py-2 sm:px-5">
            <NuxtLink
              :to="`/item/${line.item.id}`"
              class="t-label text-2xl break-words hover:underline hover:decoration-[3px]"
            >
              {{ line.item.name }}
            </NuxtLink>
            <p class="text-base font-medium text-ink-soft">
              <span v-if="line.item.assetId">UID {{ line.item.assetId }} · </span>{{ line.item.location?.name ?? 'Без места' }}
            </p>
          </div>
          <!-- The quantity is the row's own key: the stepper opens under it only when needed. -->
          <button
            v-if="line.item.quantity > 1"
            type="button"
            class="flex w-28 shrink-0 flex-col items-center justify-center border-l-[3px] border-ink px-2 hover:bg-wash active:bg-ink active:text-paper disabled:cursor-not-allowed sm:w-36"
            :class="editing === line.item.id && 'bg-ink text-paper hover:bg-ink'"
            :aria-expanded="editing === line.item.id"
            :aria-label="`Количество «${line.item.name}»: ${line.quantity} из ${line.item.quantity}. Изменить`"
            :disabled="moving"
            @click="editing = editing === line.item.id ? null : line.item.id"
          >
            <span class="t-num text-4xl">{{ line.quantity }}</span>
            <span class="t-small flex items-center gap-1">из {{ line.item.quantity }} <Pencil
              class="size-4"
              :stroke-width="2.5"
            /></span>
          </button>
          <span
            v-else
            class="t-num flex w-28 shrink-0 items-center justify-center border-l-[3px] border-ink text-4xl sm:w-36"
          >{{ line.quantity }}</span>
          <button
            type="button"
            class="flex w-16 shrink-0 items-center justify-center border-l-[3px] border-ink hover:bg-wash active:bg-ink active:text-paper disabled:cursor-not-allowed disabled:text-ink-soft sm:w-20"
            :aria-label="`Убрать «${line.item.name}» из корзины`"
            :disabled="moving"
            @click="removeLine(line)"
          >
            <X
              class="size-8"
              :stroke-width="2.5"
            />
          </button>
        </div>

        <div
          v-if="editing === line.item.id && line.item.quantity > 1"
          class="rule px-4 py-3 sm:px-5"
        >
          <QuantityStepper
            v-model="line.quantity"
            :max="line.item.quantity"
          />
        </div>

        <div
          v-if="target"
          class="rule px-4 py-2 sm:px-5"
        >
          <p
            v-if="lineState(line.item.id).moving || lineState(line.item.id).loading"
            class="flex items-center gap-2 text-lg font-medium"
          >
            <OrbLoader
              :size="28"
              label="Загрузка"
            />
            {{ lineState(line.item.id).moving ? 'Перемещаем…' : 'Проверяем по Homebox…' }}
          </p>
          <StatusStrip
            v-else-if="lineState(line.item.id).error"
            kind="error"
            :message="lineState(line.item.id).error!.message"
          />
          <template v-else-if="lineState(line.item.id).preview">
            <p
              class="text-lg font-semibold"
              :class="!lineState(line.item.id).decided && 'hatch-attention border-[3px] border-ink p-1.5'"
            >
              <span :class="!lineState(line.item.id).decided && 'inline-block bg-paper px-2 py-1'">{{ outcome(line) }}</span>
            </p>
            <div
              v-if="lineState(line.item.id).preview!.mergeCandidates.length > 1"
              class="mt-3 grid gap-2 md:grid-cols-2"
              role="radiogroup"
              :aria-label="`Куда добавить «${line.item.name}»`"
            >
              <button
                v-for="candidate in lineState(line.item.id).preview!.mergeCandidates"
                :key="candidate.id"
                type="button"
                role="radio"
                :aria-checked="lineState(line.item.id).decided && lineState(line.item.id).mergeIntoId === candidate.id"
                class="frame min-h-16 px-4 py-2 text-left text-lg font-semibold"
                :class="lineState(line.item.id).decided && lineState(line.item.id).mergeIntoId === candidate.id ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash'"
                @click="lineState(line.item.id).mergeIntoId = candidate.id; lineState(line.item.id).decided = true"
              >
                Добавить к UID {{ candidate.assetId || '—' }} · {{ candidate.quantity }} → {{ candidate.quantity + line.quantity }} шт.
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="lineState(line.item.id).decided && lineState(line.item.id).mergeIntoId === null"
                class="frame min-h-16 px-4 py-2 text-left text-lg font-semibold"
                :class="lineState(line.item.id).decided && lineState(line.item.id).mergeIntoId === null ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash'"
                @click="lineState(line.item.id).mergeIntoId = null; lineState(line.item.id).decided = true"
              >
                Записать отдельной строкой
              </button>
            </div>
          </template>
        </div>
      </article>
    </section>

    <section
      v-if="count"
      ref="whereSection"
      aria-labelledby="cart-where"
      class="flex scroll-mt-24 flex-col gap-3"
    >
      <h2
        id="cart-where"
        class="t-label text-3xl"
      >
        Куда всё переместить
      </h2>
      <div
        v-if="recent.length"
        class="flex flex-wrap gap-3"
        aria-label="Недавние места"
      >
        <button
          v-for="place in recent"
          :key="place.id"
          type="button"
          class="frame flex min-h-16 flex-col items-start justify-center px-4 py-2 text-left"
          :class="target?.id === place.id ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash active:bg-ink active:text-paper'"
          @click="chooseTarget(place)"
        >
          <span class="text-sm font-medium">{{ placeParents(place) }}</span>
          <span class="t-label text-2xl">{{ place.name }}</span>
        </button>
      </div>
      <LocationPicker
        v-model="target"
        :tree="tree ?? []"
        :current-id="null"
      />
    </section>

    <!-- One confirmation for the whole cart. -->
    <ConfirmBar v-if="count">
      <p class="flex flex-wrap items-center gap-x-3 text-lg font-semibold">
        <span class="t-num shrink-0 text-3xl sm:text-4xl">{{ count }} поз. · {{ pieces }} шт.</span>
        <template v-if="target">
          <ArrowRight
            class="size-6 shrink-0"
            :stroke-width="3"
          />
          <span class="t-label min-w-0 text-2xl break-words sm:text-3xl">{{ target.name }}</span>
        </template>
      </p>
      <p
        v-if="target && placeParents(target)"
        class="text-base font-semibold break-words sm:text-lg"
        data-target-path
      >
        {{ placeParents(target) }}
      </p>
      <button
        v-if="!target"
        type="button"
        class="mt-1 flex min-h-16 items-center gap-2 text-left text-lg font-semibold underline decoration-2 underline-offset-4 hover:bg-wash active:bg-ink active:text-paper"
        @click="showWhere"
      >
        Отсканируйте полку или выберите её в списке
        <ArrowDown
          class="size-6 shrink-0"
          :stroke-width="3"
        />
      </button>
      <button
        v-else-if="blocked.length && !moving && blocked.some(line => !lineState(line.item.id).loading)"
        type="button"
        class="hatch-attention mt-1 flex min-h-16 items-center border-[3px] border-ink p-1.5 text-left text-base sm:text-lg"
        @click="showBlocked"
      >
        <span class="flex items-center gap-2 bg-paper px-2 py-1 font-semibold">
          Проверьте строк: {{ blocked.length }} — выбор записи или ошибка. Показать
          <ArrowDown
            class="size-5 shrink-0"
            :stroke-width="3"
          />
        </span>
      </button>
      <template #action>
        <Button
          size="touch"
          class="h-16 w-full text-2xl sm:h-20 lg:w-auto lg:min-w-80 short:lg:min-w-64"
          :disabled="!canMove"
          @click="moveAll"
        >
          <OrbLoader
            v-if="moving"
            :size="28"
            label="Загрузка"
          />
          <Check v-else />
          {{ moving ? 'Перемещаем…' : 'Переместить всё' }}
        </Button>
      </template>
    </ConfirmBar>
  </div>
</template>
