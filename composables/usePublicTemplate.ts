import { isBlawbyTemplate, resolvePublicTemplate } from '~/utils/template-registry'

export function usePublicTemplate() {
  const { site, themeId } = useTenantSite()
  const template = computed(() => resolvePublicTemplate({
    themeId,
    vertical: site?.vertical,
  }))

  return {
    template,
    isBlawby: computed(() => isBlawbyTemplate({
      themeId,
      vertical: site?.vertical,
    })),
  }
}
