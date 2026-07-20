import { authClient } from '~/lib/auth-client'
import {
  buildAccountSettingsNavigation,
  buildAdminNavigation,
  buildLocationNavigation,
  buildMainNavigation,
  buildOrgSettingsNavigation,
  routeTitleLabels,
  type NavItem,
} from '~/config/dashboard-navigation'

interface AuthOrganization {
  id: string
  name: string
  slug?: string | null
  logo?: string | null
}

/**
 * Resolves dashboard route context (org/site/location, workspace mode) and the
 * navigation items/menus that follow from it. This is the single place that
 * decides "what mode is the sidebar/navbar in" — components consume the
 * resolved output and own no route-construction logic of their own.
 */
export function useDashboardNavigation() {
  const route = useRoute()
  const dashboard = useDashboardSite()
  const dashboardLocation = useDashboardLocation()
  const organizationsState = authClient.useListOrganizations()

  const organization = dashboard.organization
  const site = dashboard.site
  const sites = dashboard.sites
  const locations = dashboard.locations
  const activeSiteId = dashboard.siteId
  const currentLocation = dashboardLocation.currentLocation
  const inLocationWorkspace = dashboardLocation.inLocationWorkspace

  const organizations = computed<readonly AuthOrganization[]>(() => unref(organizationsState)?.data ?? [])

  const inAdminWorkspace = computed(() => route.path.startsWith('/admin'))
  const orgSlug = computed(() => organization.value?.slug ?? null)
  const orgBase = computed(() => orgSlug.value ? `/dashboard/${orgSlug.value}` : null)
  const orgSettingsBase = computed(() => orgSlug.value ? `/dashboard/${orgSlug.value}/~/settings` : null)

  const siteSlugFromRoute = computed(() => {
    const slug = route.params.siteSlug
    return typeof slug === 'string' ? slug : null
  })
  // Prefer the route segment (explicit); fall back to whatever dashboard-context.ts
  // resolved (e.g. org root pages with no sites/ segment yet).
  const activeSiteSlug = computed(() => siteSlugFromRoute.value ?? site.value?.subdomain ?? null)
  const siteBase = computed(() => orgBase.value && activeSiteSlug.value ? `${orgBase.value}/sites/${activeSiteSlug.value}` : null)
  const projectBase = computed(() => siteBase.value && dashboardLocation.currentLocationSlug.value ? `${siteBase.value}/${dashboardLocation.currentLocationSlug.value}` : siteBase.value)

  const inSettingsWorkspace = computed(() => {
    if (route.path.startsWith('/dashboard/account')) return true
    if (orgSettingsBase.value && route.path.startsWith(orgSettingsBase.value)) return true
    return /^\/dashboard\/[^/]+\/~\/settings/.test(route.path)
  })
  const inConversationsWorkspace = computed(() => {
    if (!siteBase.value) return /^\/dashboard\/[^/]+\/sites\/[^/]+\/conversations(?:\/|$)/.test(route.path)
    return route.path === `${siteBase.value}/conversations` || route.path.startsWith(`${siteBase.value}/conversations/`)
  })

  const organizationLabel = computed(() => organization.value?.name ?? 'Restaurant')
  const organizationAvatar = computed(() => ({
    src: organization.value?.logo ?? undefined,
    alt: organizationLabel.value,
    icon: organization.value?.logo ? undefined : 'i-lucide-building-2',
  }))

  async function switchOrganization(organizationId: string) {
    const organizationApi = authClient.organization as unknown as {
      setActive?: (_input: { organizationId: string }) => Promise<unknown>
    }
    await organizationApi.setActive?.({ organizationId })
    await dashboard.refresh()
    await navigateTo('/dashboard')
  }

  const organizationMenuItems = computed(() => [
    organizations.value.map(org => ({
      label: org.name,
      avatar: { src: org.logo ?? undefined, icon: org.logo ? undefined : 'i-lucide-building-2' },
      icon: org.id === organization.value?.id ? 'i-lucide-check' : undefined,
      onSelect: () => switchOrganization(org.id),
    })),
    [{ label: 'New business', icon: 'i-lucide-plus', to: '/dashboard/onboarding' }],
    sites.value.map(s => ({
      label: s.brand_name ?? s.subdomain ?? 'Site',
      icon: s.subdomain === activeSiteSlug.value ? 'i-lucide-check' : 'i-lucide-globe',
      to: orgBase.value && s.subdomain ? `${orgBase.value}/sites/${s.subdomain}` : undefined,
    })),
    [{ label: 'Add site', icon: 'i-lucide-plus', to: orgBase.value ? `${orgBase.value}/sites/new` : undefined }],
  ])

  const locationMenuItems = computed(() => [
    locations.value.map(location => ({
      label: location.title,
      icon: location.id === currentLocation.value?.id ? 'i-lucide-check' : 'i-lucide-map-pin',
      onSelect: () => dashboardLocation.selectLocation(location.id),
    })),
    [{ label: 'All locations', icon: 'i-lucide-layout-dashboard', to: siteBase.value ?? orgBase.value ?? '/dashboard' }],
  ])

  const adminManagedServiceEnabled = ref(false)
  watch(inAdminWorkspace, (isAdmin) => {
    if (!isAdmin) return
    $fetch<{ managedServiceEnabled: boolean }>('/api/admin/feature-flags')
      .then((res) => { adminManagedServiceEnabled.value = res.managedServiceEnabled })
      .catch(() => {})
  }, { immediate: true })

  const adminTab = computed(() => String(route.query.tab || 'queue'))

  const navigationItems = computed<NavItem[][]>(() => {
    if (inAdminWorkspace.value) {
      return buildAdminNavigation(adminTab.value, adminManagedServiceEnabled.value)
    }
    if (inConversationsWorkspace.value) return []
    if (inSettingsWorkspace.value) {
      const onOrgSettings = orgSettingsBase.value && route.path.startsWith(orgSettingsBase.value)
      return onOrgSettings ? buildOrgSettingsNavigation(orgSettingsBase.value) : buildAccountSettingsNavigation()
    }
    if (inLocationWorkspace.value) {
      const project = projectBase.value
      if (!project || !siteBase.value) return [[]]
      return buildLocationNavigation({
        overview: project,
        content: `${siteBase.value}/content`,
        inbox: `${project}/inbox`,
      })
    }
    return buildMainNavigation({
      dashboardHome: siteBase.value ?? orgBase.value ?? '/dashboard',
      conversationsPath: siteBase.value ? `${siteBase.value}/conversations` : null,
      translationsPath: siteBase.value ? `${siteBase.value}/translations` : null,
      activityPath: orgBase.value ? `${orgBase.value}/activity` : null,
      orgSettingsBase: orgSettingsBase.value,
    })
  })

  // Last-resort navbar title for routes that don't yet own their title via
  // DashboardPage/DashboardWorkspacePage props. Once every route is migrated
  // (issue #316 phase 4), this becomes dead and can be removed.
  const navbarTitle = computed(() => {
    if (inAdminWorkspace.value) return 'Platform Admin'
    const parts = route.path.split('/').filter(Boolean)
    const segment = parts.at(2) === '~'
      ? parts.at(4)
      : parts.at(2) === 'sites'
        ? (inLocationWorkspace.value ? parts.at(5) : parts.at(4))
        : parts.at(2)
    if (!segment) return 'Overview'
    return routeTitleLabels[segment] ?? 'Dashboard'
  })

  return {
    organization,
    site,
    sites,
    locations,
    activeSiteId,
    currentLocation,
    inAdminWorkspace,
    inSettingsWorkspace,
    inConversationsWorkspace,
    inLocationWorkspace,
    orgBase,
    orgSettingsBase,
    siteBase,
    projectBase,
    organizationLabel,
    organizationAvatar,
    organizationMenuItems,
    locationMenuItems,
    navigationItems,
    navbarTitle,
    switchOrganization,
  }
}
