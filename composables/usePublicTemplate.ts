import { isBlawbyTemplate, resolvePublicTemplate } from '~/utils/template-registry'

export function usePublicTemplate() {
  const { isPlatform, site, themeId } = useTenantSite()
  const template = computed(() => isPlatform
    ? null
    : resolvePublicTemplate({
        themeId,
        vertical: site?.vertical,
      }))

  return {
    template,
    isBlawby: computed(() => !isPlatform && isBlawbyTemplate({
      themeId,
      vertical: site?.vertical,
    })),
  }
}
