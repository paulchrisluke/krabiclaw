import { computed } from 'vue'
import { useI18n as useVueI18n } from 'vue-i18n'

export function useI18n() {
  const composer = useVueI18n()
  const representations = useState<Array<{ locale: string; label: string; route_path: string }>>('public-locale-representations', () => [])
  const locales = computed(() => representations.value.map(item => ({ code: item.locale, name: item.label })))

  const setLocale = (value: string) => {
    const representation = representations.value.find(item => item.locale === value)
    if (!representation) return
    return navigateTo(representation.route_path)
  }

  return Object.assign(composer, { locales, setLocale })
}
