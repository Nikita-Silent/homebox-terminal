<script setup lang="ts">
import type { Actor } from '#shared/types/terminal'
import { ArrowLeft, Check, Delete, LogIn, RefreshCw, UserRound } from '@lucide/vue'

const MAX_PIN = 8

const route = useRoute()
const { signIn } = useAuth()

const { data: people, error, refresh } = await useFetch<Actor[]>('/api/auth/users')
const apiError = computed(() => (error.value ? toApiError(error.value) : null))

const chosen = ref<Actor | null>(null)
const pin = ref('')
const busy = ref(false)
const failure = ref<ApiError | null>(null)

const notice = computed(() => {
  if (route.query.reason === 'idle') return 'Терминал закрылся после бездействия. Войдите снова — продолжите с того же места.'
  if (route.query.reason === 'expired') return 'Сессия закончилась. Войдите снова.'
  return null
})

function choose(person: Actor) {
  chosen.value = person
  pin.value = ''
  failure.value = null
}

function back() {
  chosen.value = null
  pin.value = ''
  failure.value = null
}

function press(digit: string) {
  if (busy.value || pin.value.length >= MAX_PIN) return
  failure.value = null
  pin.value += digit
}

function erase() {
  pin.value = pin.value.slice(0, -1)
}

async function submit() {
  if (!chosen.value || !pin.value || busy.value) return
  busy.value = true
  failure.value = null
  try {
    await signIn(chosen.value.id, pin.value)
    await navigateTo(safeNext(route.query.next), { replace: true })
  }
  catch (e) {
    failure.value = toApiError(e)
    pin.value = ''
    // The list may have changed (disabled employee); refresh it quietly.
    if (failure.value.code === 'NOT_FOUND' || failure.value.code === 'FORBIDDEN') refresh()
  }
  finally {
    busy.value = false
  }
}

/** A hardware keyboard works too: digits, Backspace, Enter, Escape. */
function onKeydown(event: KeyboardEvent) {
  if (!chosen.value || event.ctrlKey || event.altKey || event.metaKey) return
  if (/^\d$/.test(event.key)) press(event.key)
  else if (event.key === 'Backspace') erase()
  else if (event.key === 'Enter') submit()
  else if (event.key === 'Escape') back()
  else return
  event.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const keyClass = 't-num frame flex h-20 items-center justify-center bg-paper text-5xl hover:bg-wash active:bg-ink active:text-paper disabled:cursor-not-allowed disabled:border-dashed disabled:text-ink-soft sm:h-24'
</script>

<template>
  <div class="flex flex-col gap-6">
    <StatusStrip
      v-if="notice && !chosen"
      kind="info"
      :message="notice"
    />

    <StatusStrip
      v-if="apiError"
      kind="error"
      title="Не удалось загрузить список сотрудников"
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

    <template v-else-if="!chosen">
      <h1 class="t-label text-4xl sm:text-6xl">
        Кто работает?
      </h1>

      <div
        v-if="people && !people.length"
        class="frame unavailable p-6"
      >
        <p class="t-label text-3xl">
          Сотрудники не заведены
        </p>
        <p class="mt-2 text-lg">
          Администратор сервера задаёт первого администратора в настройках: NUXT_ADMIN_NAME и NUXT_ADMIN_PIN (6–8 цифр),
          затем перезапускает терминал.
        </p>
      </div>

      <ul
        v-else
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Сотрудники"
      >
        <li
          v-for="person in people"
          :key="person.id"
        >
          <button
            type="button"
            class="frame flex min-h-24 w-full items-center gap-4 bg-paper px-5 py-4 text-left hover:bg-wash active:bg-ink active:text-paper"
            @click="choose(person)"
          >
            <UserRound
              class="size-8 shrink-0"
              :stroke-width="2.5"
              aria-hidden="true"
            />
            <span class="t-label text-2xl break-words sm:text-3xl">{{ person.name }}</span>
          </button>
        </li>
      </ul>
    </template>

    <form
      v-else
      class="mx-auto grid w-full max-w-md items-start gap-5 lg:max-w-5xl lg:grid-cols-2 lg:gap-8"
      @submit.prevent="submit"
    >
      <div class="flex flex-col gap-5">
      <button
        type="button"
        class="t-label flex w-fit items-center gap-2 text-xl hover:underline hover:decoration-[3px] hover:underline-offset-4"
        @click="back"
      >
        <ArrowLeft
          class="size-6"
          :stroke-width="2.5"
        />
        Другой сотрудник
      </button>

      <div class="frame bg-paper">
        <p class="bg-ink px-5 py-3 text-paper">
          <span class="t-label text-3xl break-words">{{ chosen.name }}</span>
        </p>
        <div class="px-5 py-4">
          <p class="t-small">
            Личный PIN
          </p>
          <p
            class="t-num mt-2 flex h-14 items-center gap-3 text-5xl"
            role="status"
            :aria-label="`Введено цифр: ${pin.length}`"
          >
            <span
              v-for="n in Math.max(4, pin.length)"
              :key="n"
              class="inline-block size-6 border-[3px] border-ink"
              :class="n <= pin.length && 'bg-ink'"
            />
          </p>
        </div>
      </div>

      <StatusStrip
        v-if="failure"
        kind="error"
        :message="failure.message"
      />
      </div>

      <div
        class="grid grid-cols-3 gap-3"
        role="group"
        aria-label="Клавиатура PIN"
      >
        <button
          v-for="key in keys"
          :key="key"
          type="button"
          :class="keyClass"
          :disabled="busy"
          @click="press(key)"
        >
          {{ key }}
        </button>
        <button
          type="button"
          :class="keyClass"
          :disabled="busy || !pin"
          aria-label="Стереть цифру"
          @click="erase"
        >
          <Delete
            class="size-9"
            :stroke-width="2.5"
          />
        </button>
        <button
          type="button"
          :class="keyClass"
          :disabled="busy"
          @click="press('0')"
        >
          0
        </button>
        <button
          type="submit"
          class="t-label frame flex h-20 items-center justify-center bg-ink text-paper hover:bg-ink-soft active:bg-paper active:text-ink disabled:cursor-not-allowed disabled:border-dashed disabled:bg-paper disabled:text-ink-soft sm:h-24"
          :disabled="busy || pin.length < 4"
          aria-label="Войти"
        >
          <component
            :is="busy ? LogIn : Check"
            class="size-10"
            :stroke-width="3"
          />
        </button>
      </div>
    </form>
  </div>
</template>
