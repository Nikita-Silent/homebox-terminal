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
    server: {
      fs: {
        // Vite's defaults plus local data: the dev server must never hand out the Homebox
        // database, the journal or scratch files to the network.
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/.cache/**', '**/.pnpm-store/**', '*.sqlite*', '*.db*'],
      },
    },
  },

  $production: {
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': [
            'default-src \'self\'',
            // Nuxt inlines its runtime config; zxing compiles WebAssembly.
            'script-src \'self\' \'unsafe-inline\' \'wasm-unsafe-eval\'',
            'style-src \'self\' \'unsafe-inline\'',
            'img-src \'self\' data: blob:',
            'media-src \'self\' blob:',
            'object-src \'none\'',
            'base-uri \'self\'',
            'form-action \'self\'',
            'frame-ancestors \'none\'',
          ].join('; '),
          'X-Frame-Options': 'DENY',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
        },
      },
    },
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  // Server-only settings, overridden by environment variables (see .env.example):
  // NUXT_HOMEBOX_BASE_URL, NUXT_HOMEBOX_TOKEN, NUXT_JOURNAL_PATH, NUXT_JOURNAL_RETENTION_YEARS,
  // NUXT_ALLOWED_HOSTS, NUXT_SESSION_IDLE_MINUTES, NUXT_ADMIN_NAME, NUXT_ADMIN_PIN.
  runtimeConfig: {
    allowedHosts: '',
    journalRetentionYears: 5,
    session: {
      idleMinutes: 15,
    },
    admin: {
      name: 'Администратор',
      pin: '',
    },
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
