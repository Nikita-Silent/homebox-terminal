<script setup lang="ts">
import { LogOut, Maximize, Minimize, ScrollText, ShoppingBasket, Users } from '@lucide/vue'

const { isFullscreen, toggle, isSupported } = useFullscreen()
const { user, signOut } = useAuth()
const { count: cartCount } = useCart()
const route = useRoute()

// One framed control (sign out); sections are plain links so the rail stays quiet.
// Every control is a full 64px target, however short its word.
const framed = 't-label flex h-[64px] min-w-[64px] items-center justify-center gap-2 border-[3px] border-paper px-3 text-base hover:bg-paper hover:text-ink active:bg-paper active:text-ink focus-visible:outline-paper'
const navLink = (path: string) => [
  't-label flex h-[64px] min-w-[64px] items-center justify-center px-2 text-base underline-offset-8 hover:underline hover:decoration-[3px] active:bg-paper active:text-ink focus-visible:outline-paper',
  route.path.startsWith(path) && 'underline decoration-[3px] max-sm:border-b-[3px] max-sm:border-paper',
]
</script>

<template>
  <header
    data-app-rail
    class="sticky top-0 z-30 bg-ink text-paper"
  >
    <div class="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:gap-4 sm:px-8 xl:gap-6">
      <NuxtLink
        to="/"
        class="t-label flex h-[64px] items-center text-2xl tracking-wide focus-visible:outline-paper"
      >
        Терминал
      </NuxtLink>
      <HomeboxStatus />

      <nav
        v-if="user?.role === 'admin'"
        class="flex items-center gap-1 sm:gap-3"
        aria-label="Управление"
      >
        <NuxtLink
          to="/admin/journal"
          :class="navLink('/admin/journal')"
          aria-label="Журнал"
        >
          <ScrollText
            class="size-6 sm:hidden"
            :stroke-width="2.5"
          />
          <span class="hidden sm:inline">Журнал</span>
        </NuxtLink>
        <NuxtLink
          to="/admin/users"
          :class="navLink('/admin/users')"
          aria-label="Сотрудники"
        >
          <Users
            class="size-6 sm:hidden"
            :stroke-width="2.5"
          />
          <span class="hidden sm:inline">Сотрудники</span>
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-2 sm:gap-3">
        <!-- Always here, even empty: the cart screen is where collecting by scanner starts. -->
        <NuxtLink
          v-if="user"
          to="/cart"
          :class="navLink('/cart')"
          :aria-label="cartCount ? `Корзина: ${cartCount}` : 'Корзина'"
          class="gap-2"
        >
          <ShoppingBasket
            class="size-6"
            :stroke-width="2.5"
          />
          <span class="hidden sm:inline">Корзина</span>
          <span
            v-if="cartCount"
            class="t-num bg-paper px-1.5 text-xl text-ink"
          >{{ cartCount }}</span>
        </NuxtLink>
        <template v-if="user">
          <span class="hidden max-w-56 truncate text-base font-semibold xl:inline">{{ user.name }}</span>
          <button
            type="button"
            :class="framed"
            :aria-label="`Выйти (${user.name})`"
            @click="signOut()"
          >
            <LogOut
              class="size-5"
              :stroke-width="2.5"
            />
            <span class="hidden sm:inline">Выйти</span>
          </button>
        </template>
        <!-- Says what it does in words: a touch screen has no hover to explain an icon. -->
        <button
          v-if="isSupported"
          type="button"
          class="hidden h-[64px] min-w-[64px] flex-col items-center justify-center gap-0.5 border-[3px] border-paper/0 px-1 sm:flex hover:border-paper active:bg-paper active:text-ink focus-visible:outline-paper"
          :aria-label="isFullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'"
          @click="toggle()"
        >
          <component
            :is="isFullscreen ? Minimize : Maximize"
            class="size-6"
            :stroke-width="2.5"
          />
          <span class="t-small text-[0.65rem] leading-none">{{ isFullscreen ? 'Окно' : 'Экран' }}</span>
        </button>
      </div>
    </div>
  </header>
</template>
