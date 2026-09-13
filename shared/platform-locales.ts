import englishManifest from '../i18n/locales/en'
import japaneseMessages from '../i18n/catalogs/ja.json' with { type: 'json' }
import thaiMessages from '../i18n/catalogs/th.json' with { type: 'json' }
import { flattenLocaleManifest, validateLocaleCatalog } from './platform-locale-catalog'

export interface PlatformLocale {
  locale: string
  label: string
  direction: 'ltr' | 'rtl'
  messages: Readonly<Record<string, string>>
}

const englishMessages = Object.freeze(flattenLocaleManifest(englishManifest))
const japaneseValidation = validateLocaleCatalog(englishMessages, japaneseMessages, { complete: true })
if (!japaneseValidation.ok) throw new Error(`Bundled Japanese locale catalog is invalid: ${japaneseValidation.issue.kind}`)
const thaiValidation = validateLocaleCatalog(englishMessages, thaiMessages, { complete: true })
if (!thaiValidation.ok) throw new Error(`Bundled Thai locale catalog is invalid: ${thaiValidation.issue.kind}`)

export const PLATFORM_LOCALES: readonly PlatformLocale[] = Object.freeze([
  { locale: 'en', label: 'English', direction: 'ltr', messages: englishMessages },
  { locale: 'ja', label: '日本語', direction: 'ltr', messages: Object.freeze(japaneseValidation.messages) },
  { locale: 'th', label: 'ไทย', direction: 'ltr', messages: Object.freeze(thaiValidation.messages) },
])

export function platformLocale(locale: string): PlatformLocale | null {
  return PLATFORM_LOCALES.find(candidate => candidate.locale === locale) ?? null
}
