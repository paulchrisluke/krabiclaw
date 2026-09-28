/**
 * A page every template renders wraps itself in that template's layout here,
 * before it renders, so the layout's site-wide head is set first and the
 * page's own metadata is the last word.
 */
export default defineNuxtRouteMiddleware(() => {
  const { isPlatform } = useTenantOrganization()
  const { isBlawby } = usePublicTemplate()
  return setPageLayout(isPlatform ? 'platform' : isBlawby.value ? 'blawby' : 'saya')
})
