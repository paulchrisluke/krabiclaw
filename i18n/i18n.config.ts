import en from '../locales/en.json'

// `en` is the only translated locale bundled today. Vue I18n's typed locale
// union requires an entry for every configured locale, so each one is seeded
// with the English defaults and resolves through `fallbackLocale` until a real
// translation file is added. Tenant-specific overrides are layered on at
// runtime via `setLocaleMessage`.
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  messages: {
    en,
    th: en,
    fr: en,
    ja: en,
    'zh-CN': en,
    ko: en,
    es: en,
    de: en,
    it: en,
    ar: en
  }
}))
