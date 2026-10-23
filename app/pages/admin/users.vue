<script setup lang="ts">
import type { UserAccount, UserRole } from '#shared/types/terminal'
import { Check, Pencil, Power, RefreshCw, UserPlus } from '@lucide/vue'

const { user: me } = useAuth()
const { data: users, error, refresh } = await useFetch<UserAccount[]>('/api/admin/users')
const apiError = computed(() => (error.value ? toApiError(error.value) : null))

const ROLES: { id: UserRole, label: string, hint: string }[] = [
  { id: 'staff', label: 'Сотрудник', hint: 'Перемещает и смотрит журнал. PIN 4–8 цифр' },
  { id: 'admin', label: 'Администратор', hint: 'Ещё заводит сотрудников. PIN 6–8 цифр' },
]

// ── New employee ───────────────────────────────────────────────────────────

const draft = reactive({ name: '', pin: '', role: 'staff' as UserRole })
const creating = ref(false)
const createError = ref<string | null>(null)
const created = ref<string | null>(null)

async function create() {
  creating.value = true
  createError.value = null
  created.value = null
  try {
    const user = await $fetch<UserAccount>('/api/admin/users', { method: 'POST', body: { ...draft } })
    created.value = `«${user.name}» — в списке. Передайте PIN сотруднику лично.`
    Object.assign(draft, { name: '', pin: '', role: 'staff' })
    await refresh()
  }
  catch (e) {
    createError.value = toApiError(e).message
  }
  finally {
    creating.value = false
  }
}

// ── Editing ───────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null)
const edit = reactive({ name: '', pin: '', role: 'staff' as UserRole })
const saving = ref(false)
const rowError = ref<{ id: string, message: string } | null>(null)

function startEdit(user: UserAccount) {
  editingId.value = user.id
  Object.assign(edit, { name: user.name, pin: '', role: user.role })
  rowError.value = null
}

async function patch(user: UserAccount, body: Record<string, unknown>) {
  saving.value = true
  rowError.value = null
  try {
    await $fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body })
    editingId.value = null
    await refresh()
  }
  catch (e) {
    rowError.value = { id: user.id, message: toApiError(e).message }
  }
  finally {
    saving.value = false
  }
}

function save(user: UserAccount) {
  const body: Record<string, unknown> = {}
  if (edit.name.trim() !== user.name) body.name = edit.name
  if (edit.role !== user.role) body.role = edit.role
  if (edit.pin) body.pin = edit.pin
  if (!Object.keys(body).length) {
    editingId.value = null
    return
  }
  patch(user, body)
}

const promotingWithoutPin = computed(() => {
  const user = users.value?.find(u => u.id === editingId.value)
  return user && user.role !== 'admin' && edit.role === 'admin' && !edit.pin
})

const fieldClass = 'h-16 w-full min-w-0 bg-paper px-4 text-xl font-semibold frame placeholder:font-normal placeholder:text-ink-soft focus:outline-none focus-visible:outline-[4px] focus-visible:outline-offset-3 focus-visible:outline-ink'
const tileClass = 'frame flex min-h-20 flex-col items-start justify-center gap-1 px-4 py-3 text-left'
const tileState = (chosen: boolean) => (chosen ? 'bg-ink text-paper' : 'bg-paper hover:bg-wash active:bg-ink active:text-paper')
</script>

<template>
  <div class="flex flex-col gap-8 short:gap-6">
    <h1 class="t-label text-4xl sm:text-6xl short:sm:text-5xl">
      Сотрудники
    </h1>

    <form
      class="frame flex flex-col gap-4 bg-paper p-5"
      aria-labelledby="new-user"
      @submit.prevent="create"
    >
      <h2
        id="new-user"
        class="t-label text-3xl"
      >
        Новый сотрудник
      </h2>
      <div class="grid gap-3 md:grid-cols-[1fr_14rem]">
        <label class="flex flex-col gap-1">
          <span class="t-small">Имя и фамилия</span>
          <input
            v-model="draft.name"
            :class="fieldClass"
            autocomplete="off"
            maxlength="60"
            placeholder="Как в журнале"
            required
          >
        </label>
        <label class="flex flex-col gap-1">
          <span class="t-small">PIN</span>
          <input
            v-model="draft.pin"
            :class="[fieldClass, 't-num tracking-widest']"
            inputmode="numeric"
            autocomplete="off"
            pattern="[0-9]*"
            maxlength="8"
            placeholder="4–8 цифр"
            required
          >
        </label>
      </div>
      <div
        class="grid gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Роль"
      >
        <button
          v-for="role in ROLES"
          :key="role.id"
          type="button"
          role="radio"
          :aria-checked="draft.role === role.id"
          :class="[tileClass, tileState(draft.role === role.id)]"
          @click="draft.role = role.id"
        >
          <span class="t-label flex items-center gap-2 text-2xl">
            <Check
              v-if="draft.role === role.id"
              class="size-6"
              :stroke-width="3"
            />
            {{ role.label }}
          </span>
          <span class="text-base">{{ role.hint }}</span>
        </button>
      </div>
      <StatusStrip
        v-if="createError"
        kind="error"
        :message="createError"
      />
      <StatusStrip
        v-else-if="created"
        kind="info"
        :message="created"
      />
      <Button
        type="submit"
        size="touch"
        class="sm:w-fit"
        :disabled="creating || !draft.name.trim() || !draft.pin"
      >
        <UserPlus />
        Добавить
      </Button>
    </form>

    <StatusStrip
      v-if="apiError"
      kind="error"
      title="Не удалось загрузить сотрудников"
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

    <section
      v-else-if="users"
      class="flex flex-col gap-3"
      aria-label="Список сотрудников"
    >
      <p class="t-small">
        Всего: {{ users.length }}, работают: {{ users.filter(u => u.active).length }}
      </p>

      <article
        v-for="user in users"
        :key="user.id"
        class="frame bg-paper"
        :class="!user.active && 'unavailable'"
      >
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
          <div class="min-w-0 flex-[1_1_16rem]">
            <p
              class="t-label text-2xl break-words sm:text-3xl"
              :class="!user.active && 'text-ink-soft'"
            >
              {{ user.name }}
            </p>
            <p class="text-base font-semibold">
              {{ user.role === 'admin' ? 'Администратор' : 'Сотрудник' }}
              <template v-if="!user.active">
                · отключён
              </template>
              <template v-if="user.id === me?.id">
                · это вы
              </template>
            </p>
          </div>
          <div
            v-if="editingId !== user.id"
            class="flex flex-wrap gap-2"
          >
            <Button
              variant="outline"
              size="touch"
              @click="startEdit(user)"
            >
              <Pencil />
              Изменить
            </Button>
            <Button
              v-if="user.id !== me?.id"
              :variant="user.active ? 'outline' : 'default'"
              size="touch"
              :disabled="saving"
              @click="patch(user, { active: !user.active })"
            >
              <Power />
              {{ user.active ? 'Отключить' : 'Включить' }}
            </Button>
          </div>
        </div>

        <StatusStrip
          v-if="rowError?.id === user.id && editingId !== user.id"
          kind="error"
          class="mx-5 mb-4"
          :message="rowError.message"
        />

        <form
          v-if="editingId === user.id"
          class="rule flex flex-col gap-4 p-5"
          @submit.prevent="save(user)"
        >
          <div class="grid gap-3 md:grid-cols-[1fr_14rem]">
            <label class="flex flex-col gap-1">
              <span class="t-small">Имя и фамилия</span>
              <input
                v-model="edit.name"
                :class="fieldClass"
                autocomplete="off"
                maxlength="60"
                required
              >
            </label>
            <label class="flex flex-col gap-1">
              <span class="t-small">Новый PIN</span>
              <input
                v-model="edit.pin"
                :class="[fieldClass, 't-num tracking-widest']"
                inputmode="numeric"
                autocomplete="off"
                pattern="[0-9]*"
                maxlength="8"
                placeholder="не менять"
              >
            </label>
          </div>
          <div
            v-if="user.id !== me?.id"
            class="grid gap-3 sm:grid-cols-2"
            role="radiogroup"
            aria-label="Роль"
          >
            <button
              v-for="role in ROLES"
              :key="role.id"
              type="button"
              role="radio"
              :aria-checked="edit.role === role.id"
              :class="[tileClass, tileState(edit.role === role.id)]"
              @click="edit.role = role.id"
            >
              <span class="t-label flex items-center gap-2 text-2xl">
                <Check
                  v-if="edit.role === role.id"
                  class="size-6"
                  :stroke-width="3"
                />
                {{ role.label }}
              </span>
              <span class="text-base">{{ role.hint }}</span>
            </button>
          </div>
          <StatusStrip
            v-if="promotingWithoutPin"
            kind="attention"
            message="Для администратора задайте новый PIN от 6 до 8 цифр."
          />
          <StatusStrip
            v-if="rowError?.id === user.id"
            kind="error"
            :message="rowError.message"
          />
          <div class="flex flex-wrap gap-3">
            <Button
              type="submit"
              size="touch"
              :disabled="saving || promotingWithoutPin"
            >
              <Check />
              Сохранить
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              @click="editingId = null"
            >
              Отмена
            </Button>
          </div>
        </form>
      </article>
    </section>
  </div>
</template>
