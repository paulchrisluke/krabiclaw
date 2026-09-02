import { computed } from 'vue'
import { useI18n as useVueI18n } from 'vue-i18n'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'
import { formatTenantLocalePath } from '~/utils/tenant-locale-path'

export function useI18n() {
  const composer = useVueI18n()
  const representations = useState<PublicLocaleRepresentation[]>('public-locale-representations', () => [])
  const locales = computed(() => representations.value.map(item => ({ code: item.locale, name: item.label })))

  const setLocale = (value: string) => {
    const representation = representations.value.find(item => item.locale === value)
    if (!representation) return
    return navigateTo(representation.route_path)
  }
  const localePath = (path: string) => formatTenantLocalePath(path, composer.locale.value)

  return Object.assign(composer, { locales, setLocale, localePath })
}
