import { computed } from 'vue'
import { useI18n as useVueI18n } from 'vue-i18n'
import { APP_LOCALES, normalizeAppLocale } from '~/utils/app-i18n'

export function useI18n() {
  const composer = useVueI18n()
  const locales = computed(() => APP_LOCALES)

  const setLocale = (value: string) => {
    const locale = normalizeAppLocale(value)
    if (!locale) return
    composer.locale.value = locale
  }

  return Object.assign(composer, { locales, setLocale })
}
