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
    // paths.value.locations points at the site root (there is no dedicated
    // locations list page — the site overview page doubles as one), distinct
    // from the /locations/:location prefix used below for a specific location's
    // own routes (see pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/).
    const locationsBase = siteBase
    const locationBase = siteSlug && locationSlug ? `${siteBase}/locations/${locationSlug}` : siteBase
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
      order: `${locationBase}/orders`,
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
    return `${paths.value.site}/locations/${location?.slug ?? locationId}`
  }
  const locationMenuPath = (locationId: string) => `${locationPath(locationId)}/menu`
  // Points at the location-scoped content editor's "location" page (a distinct
  // route from paths.value.content, which is site-scoped only) — see
  // pages/dashboard/[orgSlug]/sites/[siteSlug]/locations/[locationSlug]/content/[pageId].vue.
  const locationContentPath = (locationId: string) => `${locationPath(locationId)}/content/location`

  const menuPath = (locationId?: string | null) => {
    if (locationId) {
      const location = dashboard.locations.value.find(candidate => candidate.id === locationId || candidate.slug === locationId)
      const locationSlug = location?.slug ?? locationId
      return {
        path: `${paths.value.site}/locations/${locationSlug}/menu`,
        query: {}
      }
    }
    return {
      path: paths.value.menu,
      query: {}
    }
  }

  const contentPath = (page?: string) => (page ? `${paths.value.content}/${page}` : paths.value.content)

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
