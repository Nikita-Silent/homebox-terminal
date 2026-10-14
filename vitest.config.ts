import { quickpickle } from 'quickpickle'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'logic/features/**/*.feature'],
    setupFiles: ['logic/steps/transfer.steps.ts'],
    environment: 'node',
  },
})
