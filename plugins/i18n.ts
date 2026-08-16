import { createI18n } from 'vue-i18n'
import en from '~/i18n/locales/en.json'
import th from '~/i18n/locales/th.json'
import { APP_DEFAULT_LOCALE } from '~/utils/app-i18n'

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: APP_DEFAULT_LOCALE,
    fallbackLocale: APP_DEFAULT_LOCALE,
    messages: { en, th },
  })

  nuxtApp.vueApp.use(i18n)
  nuxtApp.provide('appLocale', i18n.global.locale)
})
