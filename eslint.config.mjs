import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: ['.pnpm-store/**', '.cache/**', 'app/components/ui/**'],
})
