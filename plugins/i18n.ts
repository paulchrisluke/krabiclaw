import { createI18n } from 'vue-i18n'
import en from '~/i18n/locales/en.json'
import th from '~/i18n/locales/th.json'
import { APP_DEFAULT_LOCALE, normalizeAppLocale } from '~/utils/app-i18n'

export default defineNuxtPlugin((nuxtApp) => {
  const requestLocale = normalizeAppLocale(useRequestURL().searchParams.get('locale'))
  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: requestLocale ?? APP_DEFAULT_LOCALE,
    fallbackLocale: APP_DEFAULT_LOCALE,
    messages: { en, th },
  })

  nuxtApp.vueApp.use(i18n)
  nuxtApp.provide('appLocale', i18n.global.locale)
})
