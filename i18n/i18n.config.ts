import en from '../locales/en.json'
import th from '../locales/th.json'

// Non-English locales without translation files are seeded with English defaults so fallbackLocale resolves correctly.
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  messages: {
    en,
    th,
    fr: { ...en },
    ja: { ...en },
    'zh-CN': { ...en },
    ko: { ...en },
    es: { ...en },
    de: { ...en },
    it: { ...en },
    ar: { ...en }
  }
}))
