import { PLATFORM_TEMPLATE, isBlawbyTemplate, resolvePublicTemplate } from '~/utils/template-registry'

export function usePublicTemplate() {
  const { isPlatform, organization, themeId } = useTenantOrganization()
  // KrabiClaw's own site has a template like any other site: it renders page
  // documents at the paths that template declares (#903). Returning null here
  // made every platform route ask a template that did not exist, which is why
  // the marketing pages had to be hardcoded Vue instead of CMS documents.
  //
  // A pure client context carries no theme id and no site, so the platform
  // template answers from the registry rather than from a resolver that needs
  // a selector it was never given.
  const template = computed(() => isPlatform && !themeId
    ? PLATFORM_TEMPLATE
    : resolvePublicTemplate({
        themeId,
        vertical: organization?.vertical,
      }))

  return {
    template,
    isBlawby: computed(() => !isPlatform && isBlawbyTemplate({
      themeId,
      vertical: organization?.vertical,
    })),
  }
}
