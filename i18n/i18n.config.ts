// Locale files are loaded from i18n/locales/ via nuxt.config.ts langDir — no bundling needed here.
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
}))
