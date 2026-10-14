import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  devtools: { enabled: false },
  telemetry: false,
  ssr: false,

  modules: ['@nuxt/eslint', '@vueuse/nuxt', 'shadcn-nuxt'],

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  // Server-only settings. Overridden by NUXT_HOMEBOX_BASE_URL, NUXT_HOMEBOX_TOKEN, NUXT_JOURNAL_PATH.
  runtimeConfig: {
    homebox: {
      baseUrl: '',
      token: '',
    },
    journalPath: './.data/journal.sqlite',
  },

  app: {
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Склад — терминал',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
    },
  },

  typescript: {
    strict: true,
  },
})
