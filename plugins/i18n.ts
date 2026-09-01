import { createI18n } from 'vue-i18n'
import en from '~/i18n/locales/en.json'

function expandMessages(messages: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const [path, value] of Object.entries(messages)) {
    const parts = path.split('.')
    let cursor = root
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) cursor[part] = value
      else {
        const next = cursor[part]
        if (!next || typeof next !== 'object' || Array.isArray(next)) cursor[part] = {}
        cursor = cursor[part] as Record<string, unknown>
      }
    }
  }
  return root
}

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: 'en',
    fallbackLocale: false,
    messages: { en },
  })

  nuxtApp.vueApp.use(i18n)
  nuxtApp.provide('appLocale', i18n.global.locale)
  // Imperative, not a reactive watch: the routing layer (pages/[...tenantPath].vue)
  // resolves locale/messages inside its own synchronous <script setup>, before any
  // descendant (header/footer, which call t()) renders. A watch() with default SSR
  // flush timing is not guaranteed to have re-run by then, so callers must apply the
  // locale directly at the point they resolve it instead of mutating reactive state
  // and hoping a watcher catches up.
  nuxtApp.provide('setAppLocale', (locale: string, messages: Record<string, string> | null) => {
    if (locale !== 'en' && messages) {
      i18n.global.setLocaleMessage(locale, expandMessages(messages) as typeof en)
    }
    i18n.global.locale.value = locale as 'en'
  })
})
