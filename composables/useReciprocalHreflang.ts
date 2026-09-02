// The Thai-prefixed routes (pages/[...tenantPath].vue) already link back to
// their English canonical equivalent (hreflang="en"). The reverse direction -
// an English resource page telling crawlers a Thai translation exists - has
// no local signal to check, since the English page is matched directly by
// Nuxt's own file router and never resolves a localized route itself. Reuse
// the same public localized-route resolver every Thai page already goes
// through instead of adding a second way to answer "is this translated".
import { publicApiRequest, isRecord } from '~/utils/api-clients'
import { callWithNuxt } from '#app'

const isLocalizedRouteOk = (value: unknown): value is { route: unknown } =>
  isRecord(value) && isRecord(value.route)

export async function useReciprocalHreflang(canonicalPath: () => string | null | undefined) {
  const { siteId, isTenant } = useTenantSite()
  const { locale } = useI18n()
  const path = canonicalPath()
  // Captured here, synchronously during setup: both the request event and
  // the Nuxt app instance. A dynamic import() inside the useAsyncData
  // callback below crosses a real async I/O boundary, which drops Nuxt's
  // ambient app context for whatever runs after the await resolves -
  // callWithNuxt is what puts it back before the later useHead() call.
  const requestEvent = useRequestEvent()
  const nuxtApp = useNuxtApp()

  const key = `reciprocal-hreflang-${siteId}-${path ?? ''}`

  const { data } = await useAsyncData(key, async () => {
    if (!isTenant || !siteId || locale.value !== 'en' || !path) return false
    const thPath = `/th${path === '/' ? '' : path}`
    try {
      if (import.meta.server) {
        // Every other shared resource component takes this same direct-DB
        // branch during SSR instead of a self-fetch back into the app's own
        // API - a bare $fetch has no base URL in this SSR context and fails
        // on a relative path.
        if (!requestEvent) return false
        const [{ cloudflareEnv }, { resolveLocalizedPublicRoute }, { queryFirst }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/utils/localization'),
          import('~/server/db'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) return false
        const site = await queryFirst<{ organization_id: string }>(db, `SELECT organization_id FROM sites WHERE id = ? AND status = 'active' LIMIT 1`, [siteId])
        if (!site) return false
        await resolveLocalizedPublicRoute(db, site.organization_id, siteId, thPath)
      } else {
        await publicApiRequest(`/api/public/sites/${encodeURIComponent(siteId)}/localized-route`, {
          query: { path: thPath },
          validate: isLocalizedRouteOk,
        })
      }
      return true
    } catch {
      return false
    }
  }, { server: true })

  if (data.value && path) {
    callWithNuxt(nuxtApp, () => useHead({
      link: [{ rel: 'alternate', hreflang: 'th', href: `/th${path === '/' ? '' : path}` }],
    }))
  }
}
