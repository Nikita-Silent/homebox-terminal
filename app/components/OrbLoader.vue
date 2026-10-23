<script setup lang="ts">
import type { OrbState } from 'thinking-orbs/engine'
import { MODE_FRAMES, paintFrame, resolvePreset } from 'thinking-orbs/engine'

/**
 * The terminal's loader: a dotted orb from thinking-orbs (https://libraries.dev/orbs), drawn with
 * its framework-free engine. Black dots on paper; `inverted` for a black ground (primary buttons,
 * error strips). Any display size: the 64 or 20 px design is drawn and scaled, so it stays crisp.
 */
const props = withDefaults(defineProps<{
  state?: OrbState
  /** CSS pixels. */
  size?: number
  inverted?: boolean
  label?: string
}>(), { state: 'working', size: 64, inverted: false, label: 'Загрузка' })

const canvas = ref<HTMLCanvasElement | null>(null)
let stop: (() => void) | undefined

function start() {
  stop?.()
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  // Small marks use the design tuned for inline text, the rest the avatar-scale one.
  const design = props.size <= 32 ? 20 : 64
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  el.width = Math.round(props.size * dpr)
  el.height = Math.round(props.size * dpr)
  const { mode, speed, opts } = resolvePreset(props.state, design)
  const draw = MODE_FRAMES[mode]
  const scale = (props.size / design) * dpr
  const paint = (t: number) => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, design, design)
    paintFrame(ctx, draw(design, t, opts), props.inverted)
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    paint(0.6)
    stop = undefined
    return
  }
  let frame = 0
  const loop = () => {
    paint((performance.now() / 1000) * speed)
    frame = requestAnimationFrame(loop)
  }
  loop()
  stop = () => cancelAnimationFrame(frame)
}

onMounted(start)
watch(() => [props.state, props.size, props.inverted], start)
onBeforeUnmount(() => stop?.())
</script>

<template>
  <canvas
    ref="canvas"
    role="img"
    :aria-label="label"
    class="block shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>
