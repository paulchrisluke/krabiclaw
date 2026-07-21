import { computed, unref, type MaybeRef } from 'vue'

export interface DashboardActionLink {
  label: string
  icon?: string
  to?: string
  target?: '_blank'
  external?: boolean
  color?: 'primary' | 'neutral' | 'success' | 'warning' | 'error'
  variant?: 'solid' | 'soft' | 'outline' | 'ghost' | 'link'
  disabled?: boolean
  onClick?: () => void
}

function appendQuery(path: string, query: Record<string, string | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value.length > 0) params.set(key, value)
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

export function useDashboardSiteLinks(siteId: MaybeRef<string>, sitePublicUrl?: MaybeRef<string | null | undefined>, orgSlug?: MaybeRef<string | null | undefined>) {
  void siteId
  const dashboard = useDashboardSite()
  const dashboardLocation = useDashboardLocation()
  const route = useRoute()

  const paths = computed(() => {
    const base = '/dashboard'
    const slug = orgSlug ? unref(orgSlug) : dashboard.organization.value?.slug
    const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : dashboard.site.value?.subdomain
    const locationSlug = dashboardLocation.currentLocationSlug.value
    const orgBase = slug ? `${base}/${slug}` : base
    const siteBase = slug && siteSlug ? `${orgBase}/sites/${siteSlug}` : orgBase
    const locationsBase = `${siteBase}/locations`
    // Canonical location base — matches issue #316's target route shape
    // (pages/dashboard/:org/sites/:site/locations/:location), not the old flat
    // /sites/:site/:locationSlug shape. Callers under the still-unmoved
    // pages/dashboard/[orgSlug]/sites/[siteSlug]/[locationSlug]/ directory will
    // 404 against this until that directory moves (issue #316 phase 4) — an
    // accepted mid-refactor gap, not a regression to work around here.
    const locationBase = siteSlug && locationSlug ? `${locationsBase}/${locationSlug}` : siteBase
    const settingsBase = `${orgBase}/settings`
    return {
      base,
      org: orgBase,
      site: siteBase,
      project: locationBase,
      conversations: `${siteBase}/conversations`,
      content: `${siteBase}/content`,
      menu: `${locationBase}/menu`,
      posts: `${locationBase}/posts`,
      reviews: `${locationBase}/reviews`,
      photos: `${locationBase}/photos`,
      qa: `${locationBase}/qa`,
      inbox: `${locationBase}/inbox`,
      reservations: `${locationBase}/reservations`,
      order: `${locationBase}/order`,
      media: `${locationBase}/media`,
      locations: locationsBase,
      translations: `${siteBase}/translations`,
      settings: settingsBase,
      settingsGeneral: `${settingsBase}/general`,
      settingsBilling: `${settingsBase}/billing`,
      // Account-level (no slug)
      account: `${base}/account/profile`,
      accountAuthentication: `${base}/account/authentication`,
      accountBillingItems: `${base}/account/billing-items`,
    }
  })

  function safeHttpUrl(value: unknown): string | null {
    if (!value || typeof value !== 'string') return null

    const raw = value.trim()
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`

    try {
      const url = new URL(candidate)
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
    } catch {
      return null
    }
  }

  const resolvedPublicUrl = computed(() => {
    return safeHttpUrl(sitePublicUrl ? unref(sitePublicUrl) : null)
  })

  const previewLink = computed<DashboardActionLink>(() => ({
    label: 'Preview',
    icon: 'i-lucide-external-link',
    to: resolvedPublicUrl.value || undefined,
    target: '_blank',
    external: true,
    color: 'neutral',
    variant: 'outline',
    disabled: !resolvedPublicUrl.value
  }))

  const overviewLink = computed<DashboardActionLink>(() => ({
    label: 'Site',
    icon: 'i-lucide-house',
    to: paths.value.site,
    color: 'neutral',
    variant: 'soft'
  }))

  function buildHeaderLinks(
    extras: DashboardActionLink[] = [],
    options: { includeOverview?: boolean; includePreview?: boolean } = {}
  ): DashboardActionLink[] {
    const links: DashboardActionLink[] = []
    if (options.includeOverview !== false) links.push(overviewLink.value)
    links.push(...extras)
    if (options.includePreview !== false) links.push(previewLink.value)
    return links
  }

  const locationPath = (locationId: string) => {
    const location = dashboard.locations.value.find(candidate => candidate.id === locationId || candidate.slug === locationId)
    return `${paths.value.site}/${location?.slug ?? locationId}`
  }
  const locationMenuPath = (locationId: string) => `${locationPath(locationId)}/menu`
  const locationContentPath = (locationId: string) => appendQuery(`${paths.value.content}`, { page: 'location', location: locationId })

  const menuPath = (locationId?: string | null) => {
    if (locationId) {
      const location = dashboard.locations.value.find(candidate => candidate.id === locationId || candidate.slug === locationId)
      const locationSlug = location?.slug ?? locationId
      return {
        path: `${paths.value.site}/${locationSlug}/menu`,
        query: {}
      }
    }
    return {
      path: paths.value.menu,
      query: {}
    }
  }

  const contentPath = (page?: string) => ({
    path: paths.value.content,
    query: page ? { page } : {}
  })

  const editorBackPath = computed(() => paths.value.project)

  return {
    paths,
    overviewLink,
    previewLink,
    buildHeaderLinks,
    locationPath,
    locationMenuPath,
    locationContentPath,
    menuPath,
    contentPath,
    editorBackPath
  }
}
