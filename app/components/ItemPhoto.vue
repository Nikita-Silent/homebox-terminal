<script setup lang="ts">
import type { ItemSummary } from '#shared/types/terminal'

/**
 * The item's Homebox photo, printed in grayscale like everything else on the label.
 * Renders nothing when there is no photo or it cannot be loaded, so layouts never show a broken image.
 */
const props = withDefaults(defineProps<{
  item: Pick<ItemSummary, 'id' | 'name' | 'hasImage' | 'imageId'>
  size?: 'thumb' | 'full'
  /** Next to the item's name the photo adds nothing for a screen reader. */
  decorative?: boolean
}>(), { size: 'thumb', decorative: false })

const emit = defineEmits<{ failed: [] }>()

const failed = ref(false)
watch(() => props.item.imageId, () => {
  failed.value = false
})

const src = computed(() => `/api/items/${props.item.id}/image?size=${props.size}&v=${props.item.imageId ?? ''}`)
</script>

<template>
  <img
    v-if="item.hasImage && !failed"
    :src="src"
    :alt="decorative ? '' : `Фото: ${item.name}`"
    loading="lazy"
    decoding="async"
    class="grayscale contrast-125"
    @error="failed = true; emit('failed')"
  >
</template>
