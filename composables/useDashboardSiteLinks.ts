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
    const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
    const locationSlug = dashboardLocation.currentLocationSlug.value
    const orgBase = slug ? `${base}/${slug}` : base
    const siteBase = slug && siteSlug ? `${orgBase}/sites/${siteSlug}` : orgBase
    const locationsBase = `${siteBase}/locations`
    const locationBase = siteSlug && locationSlug ? `${siteBase}/locations/${locationSlug}` : siteBase
    const orgSettingsBase = `${orgBase}/settings`
    return {
      base,
      org: orgBase,
      site: siteBase,
      project: locationBase,
      conversations: `${siteBase}/conversations`,
      pages: `${siteBase}/pages`,
      products: `${locationBase}/products`,
      posts: `${locationBase}/posts`,
      photos: `${locationBase}/photos`,
      qa: `${locationBase}/qa`,
      inbox: `${siteBase}/inbox`,
      siteInbox: `${siteBase}/inbox`,
      locationInbox: `${locationBase}/inbox`,
      reservations: `${locationBase}/reservations`,
      // Orders is site-scoped (pages/dashboard/[orgSlug]/sites/[siteSlug]/orders.vue),
      // not per-location — do not point this at locationBase.
      order: `${siteBase}/orders`,
      media: `${siteBase}/media`,
      locations: locationsBase,
      domains: `${siteBase}/domains`,
      settings: `${siteBase}/settings`,
      siteSettings: `${siteBase}/settings`,
      locationSettings: `${locationBase}/settings`,
      orgSettings: orgSettingsBase,
      settingsGeneral: `${orgSettingsBase}/general`,
      settingsBilling: `${orgSettingsBase}/billing`,
      // Account-level (no slug)
      accountProfile: `${base}/account/profile`,
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
  const locationBasePath = (locationId: string) => locationPath(locationId)
  const locationSettingsPath = (locationId: string) => `${locationBasePath(locationId)}/settings`
  const locationProductsPath = (locationId: string) => `${locationBasePath(locationId)}/products`
  const locationContentPath = (_locationId: string) => paths.value.pages

  const productsPath = (locationId?: string | null) => {
    if (locationId) {
      const location = dashboard.locations.value.find(candidate => candidate.id === locationId || candidate.slug === locationId)
      const locationSlug = location?.slug ?? locationId
      return {
        path: `${paths.value.site}/locations/${locationSlug}/products`,
        query: {}
      }
    }
    return {
      path: paths.value.products,
      query: {}
    }
  }

  const contentPath = (page?: string) => (page ? `${paths.value.pages}/${page}` : paths.value.pages)

  const editorBackPath = computed(() => paths.value.project)

  return {
    paths,
    overviewLink,
    previewLink,
    buildHeaderLinks,
    locationPath,
    locationSettingsPath,
    locationProductsPath,
    locationContentPath,
    productsPath,
    contentPath,
    editorBackPath
  }
}
