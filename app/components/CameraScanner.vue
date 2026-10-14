<script setup lang="ts">
import { X } from '@lucide/vue'

const emit = defineEmits<{ scan: [code: string], close: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const status = ref<'starting' | 'scanning' | 'denied' | 'unsupported'>('starting')
let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let stopped = false

type Detect = (source: HTMLVideoElement) => Promise<string | null>

/** Native BarcodeDetector where the browser has it, zxing-wasm (served locally) everywhere else. */
async function createDetector(): Promise<Detect> {
  const Native = (globalThis as { BarcodeDetector?: new (o?: object) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
  if (Native) {
    const detector = new Native()
    return async source => (await detector.detect(source))[0]?.rawValue ?? null
  }

  const [{ prepareZXingModule, readBarcodes }, { default: wasmUrl }] = await Promise.all([
    import('zxing-wasm/reader'),
    import('zxing-wasm/reader/zxing_reader.wasm?url'),
  ])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  return async (source) => {
    canvas.width = source.videoWidth
    canvas.height = source.videoHeight
    context.drawImage(source, 0, 0)
    const results = await readBarcodes(context.getImageData(0, 0, canvas.width, canvas.height), { maxNumberOfSymbols: 1 })
    return results[0]?.text || null
  }
}

onMounted(async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status.value = 'unsupported'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  }
  catch {
    status.value = 'denied'
    return
  }
  if (stopped) return stop()
  video.value!.srcObject = stream
  await video.value!.play()
  const detect = await createDetector()
  status.value = 'scanning'

  const tick = async () => {
    if (stopped || !video.value) return
    const code = video.value.readyState >= 2 ? await detect(video.value).catch(() => null) : null
    if (code) {
      emit('scan', code)
      return
    }
    timer = setTimeout(tick, 200)
  }
  tick()
})

function stop() {
  stopped = true
  if (timer) clearTimeout(timer)
  stream?.getTracks().forEach(track => track.stop())
}

onBeforeUnmount(stop)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col bg-ink text-paper"
    role="dialog"
    aria-modal="true"
    aria-label="Сканирование камерой"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <div class="flex h-20 items-center justify-between gap-4 px-4 sm:px-8">
      <p class="t-label text-2xl">
        Наведите камеру на этикетку
      </p>
      <button
        type="button"
        class="t-label flex h-16 items-center gap-3 border-[3px] border-paper px-6 text-xl hover:bg-paper hover:text-ink focus-visible:outline-paper"
        autofocus
        @click="emit('close')"
      >
        <X
          class="size-6"
          :stroke-width="2.5"
        />
        Закрыть
      </button>
    </div>
    <div class="relative flex flex-1 items-center justify-center overflow-hidden">
      <video
        ref="video"
        class="h-full w-full object-cover grayscale"
        muted
        playsinline
      />
      <div
        v-if="status === 'scanning'"
        class="pointer-events-none absolute aspect-[46/26] w-[min(80vw,640px)] border-[6px] border-paper"
      />
      <p
        v-if="status === 'starting'"
        class="t-label absolute text-2xl"
      >
        Включаем камеру…
      </p>
      <div
        v-else-if="status === 'denied' || status === 'unsupported'"
        class="absolute max-w-lg border-[3px] border-paper p-8 text-center"
      >
        <p class="t-label text-3xl">
          Камера недоступна
        </p>
        <p class="mt-3 text-lg">
          {{ status === 'denied'
            ? 'Разрешите доступ к камере в настройках браузера или используйте USB-сканер.'
            : 'Браузер не даёт доступ к камере. Камера работает только по HTTPS или на этом же компьютере. Используйте USB-сканер.' }}
        </p>
      </div>
    </div>
  </div>
</template>
