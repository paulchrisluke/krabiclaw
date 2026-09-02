export default defineNuxtRouteMiddleware(async (to) => {
  const state = useState<string>('public-locale', () => 'en')
  const locale = typeof to.params.locale === 'string' ? to.params.locale : 'en'
  if (import.meta.server && locale !== 'en') {
    const event = useRequestEvent()
    const siteId = event?.context.siteId as string | null | undefined
    if (event && siteId) {
      const [{ cloudflareEnv }, { queryFirst }, { assertPublicSiteLanguageEntitlement }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/db'),
        import('~/server/utils/localization'),
      ])
      const db = cloudflareEnv(event).db
      if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
      const site = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ? AND status = \'active\' LIMIT 1', [siteId])
      if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
      await assertPublicSiteLanguageEntitlement(db, site.organization_id, siteId, locale)
    }
  }
  state.value = locale
})
