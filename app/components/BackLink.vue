<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'

/**
 * The way back from a screen, a full 64px hit target rather than a line of text. When the previous
 * history entry is the same place it steps back instead, so the list comes back as it was left:
 * the same query, filter and scroll position.
 */
const props = defineProps<{ to: string }>()

const router = useRouter()

function go(event: MouseEvent) {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return
  const back = (window.history.state as { back?: string } | null)?.back
  if (back !== props.to) return
  event.preventDefault()
  router.back()
}
</script>

<template>
  <NuxtLink
    :to="to"
    class="t-label -my-2 flex min-h-16 w-fit max-w-full items-center gap-3 py-2 pr-5 text-xl hover:underline hover:decoration-[3px] hover:underline-offset-4 active:bg-ink active:text-paper"
    @click="go"
  >
    <ArrowLeft
      class="size-7 shrink-0"
      :stroke-width="2.5"
    />
    <span class="min-w-0 break-words"><slot /></span>
  </NuxtLink>
</template>
