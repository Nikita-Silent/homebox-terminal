import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { quickpickle } from 'quickpickle'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

/**
 * @nuxt/test-utils 4.3 serves its app entry stub under a root-relative id (`/node_modules/…`);
 * with vite 8 relative imports from it then resolve against the filesystem root and fail.
 * Resolve them against the project root instead.
 */
const rootRelativeImports: Plugin = {
  name: 'test:root-relative-imports',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer?.startsWith('/node_modules/') || !source.startsWith('.')) return null
    return resolve(root, `.${dirname(importer)}`, source)
  },
}

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['app/**/*.{ts,vue}', 'server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['**/*.test.ts', 'app/test/**', 'server/test/**', 'app/components/ui/**', 'app/app.vue', 'app/layouts/**'],
      reportsDirectory: '.cache/coverage',
      reporter: ['text-summary', 'text'],
    },
    projects: [
      {
        test: {
          name: 'server',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [quickpickle()],
        test: {
          name: 'logic',
          include: ['logic/features/**/*.feature'],
          setupFiles: ['logic/steps/transfer.steps.ts', 'logic/steps/auth.steps.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        plugins: [rootRelativeImports],
        test: {
          name: 'app',
          include: ['app/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: {
            nuxt: { rootDir: root, domEnvironment: 'happy-dom' },
          },
        },
      }),
    ],
  },
})
