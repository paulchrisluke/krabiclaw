<template>
  <UApp>
    <div class="platform-theme">
    <div v-if="impersonatedBy" class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 sm:left-1/2 sm:right-auto sm:w-1/3 sm:-translate-x-1/2 sm:px-0">
      <div class="pointer-events-auto flex w-full max-w-full flex-wrap items-center justify-center gap-3 rounded-t-2xl border border-warning/40 border-b-0 bg-default px-6 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.15)]">
        <span class="relative flex size-2 shrink-0">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-warning" />
        </span>
        <span class="min-w-0 truncate text-sm font-medium text-highlighted">
          Impersonating <span class="font-semibold">{{ sessionData?.user?.email }}</span>
        </span>
        <UButton size="xs" color="warning" variant="soft" :loading="stoppingImpersonation" @click="stopImpersonating">
          Exit to Admin
        </UButton>
      </div>
    </div>

    <div
      v-if="dashboard.pending.value"
      class="flex min-h-screen items-center justify-center bg-default px-6"
      data-testid="dashboard-context-loading"
    >
      <div class="w-full max-w-xl space-y-4">
        <div class="h-7 w-48 animate-pulse rounded bg-elevated" />
        <div class="h-32 animate-pulse rounded-xl bg-elevated" />
      </div>
    </div>
    <div
      v-else-if="dashboardContextError"
      class="flex min-h-screen items-center justify-center bg-default px-6"
      data-testid="dashboard-context-error"
    >
      <UCard class="w-full max-w-xl">
        <h1 class="text-xl font-semibold text-highlighted">Dashboard context could not be loaded</h1>
        <p class="mt-3 text-sm text-muted">{{ dashboardContextErrorMessage }}</p>
        <p v-if="dashboardContextRequestId" class="mt-2 text-xs text-dimmed">
          Request ID: {{ dashboardContextRequestId }}
        </p>
        <UButton class="mt-6" :loading="dashboard.pending.value" @click="retryDashboardContext">
          Try again
        </UButton>
      </UCard>
    </div>

    <div v-else>
    <DashboardTopNav
      v-if="showDashboardChrome"
      :items="primaryNavItems"
      :home-to="topNavHomeTo"
      @menu="menuOpen = true"
    />

    <UDashboardGroup
      unit="rem"
      :min-size="14"
      :default-size="18"
      :max-size="24"
      :ui="{ base: showDashboardChrome ? 'md:top-(--kc-dashboard-top-nav) max-md:bottom-(--kc-dashboard-bottom-nav)' : '' }"
    >
      <UDashboardSearch v-model:search-term="dashboardSearchTerm" :groups="dashboardSearchGroups" :loading="dashboardSearchLoading" :color-mode="false" />

      <slot />
    </UDashboardGroup>

    <nav
      v-if="showDashboardChrome"
      class="fixed inset-x-0 bottom-0 z-40 flex h-(--kc-dashboard-bottom-nav) items-stretch border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Dashboard"
      data-testid="dashboard-mobile-nav"
    >
      <NuxtLink
        v-for="item in primaryNavItems"
        :key="item.key"
        :to="item.to"
        class="flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 no-underline transition-colors"
        :class="item.active ? 'text-primary' : 'text-dimmed hover:text-highlighted'"
        :aria-current="item.active ? 'page' : undefined"
      >
        <UIcon :name="item.icon" class="size-6 shrink-0" />
        <span class="text-[10px] leading-tight font-medium">{{ item.label }}</span>
      </NuxtLink>
      <NuxtLink
        :to="menuPageTo"
        class="flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 no-underline transition-colors"
        :class="isMenuPageActive ? 'text-primary' : 'text-dimmed hover:text-highlighted'"
        :aria-current="isMenuPageActive ? 'page' : undefined"
        data-testid="dashboard-mobile-nav-menu-link"
      >
        <UIcon name="i-lucide-menu" class="size-6 shrink-0" />
        <span class="text-[10px] leading-tight font-medium">Menu</span>
      </NuxtLink>
    </nav>
    </div>

    <DashboardMenuSlideover v-model:open="menuOpen" />

    <BillingServiceUpsellModal />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import DashboardTopNav from '~/lib/components/workspace/dashboard/DashboardTopNav.vue'
import DashboardMenuSlideover from '~/lib/components/workspace/dashboard/DashboardMenuSlideover.vue'
import type { DashboardScopeHeaderModel } from '~/lib/components/workspace/dashboard/DashboardScopeHeader.vue'
import { dashboardOrganizationParentKey, dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'
import { useAnalytics } from '~/composables/useAnalytics'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import '~/assets/css/dashboard.css'

// ─────────────────────────────────────────────────────────────────────────
// Dashboard shell architecture.
//
// The sidebar this layout used to carry is gone, along with the scope-grouped
// manager nav that issue #316 designed. That nav had already stopped rendering
// before it was removed — its groups were declared, underscore-prefixed to
// silence the unused-vars rule, and referenced by nothing. Site-level nav lives
// on the site overview page itself, which links Media, Settings, Links, Pages
// and Locations directly.
//
// Invariants that must hold no matter what gets added later:
// - One layout, one nav source. mobileNavItems feeds both the top nav and the
//   bottom bar; never build a second list for one of them.
// - `scope` is derived ONLY from explicit route params (locationSlug > siteSlug
//   > orgSlug), never from route.path regexes, residual dashboard-context state,
//   or a "last visited" fallback — those misclassify scope at ancestor routes
//   once state has been populated from a deeper page in the same session.
// - New verticals/templates need zero changes here: capabilities come from
//   resolveCmsCapabilities, and the only thing this layout reads from them is
//   locationVocabulary, for the children label.
// ─────────────────────────────────────────────────────────────────────────

interface AuthOrganization {
  id: string
  name: string
  slug: string
  logo?: string | null
}

const route = useRoute()
const _config = useRuntimeConfig()
const { data: sessionData, refreshSession, signOut: _signOut } = useAuth()
const { trackDashboardVisited, setUserId } = useAnalytics()
const toast = useToast()
const stoppingImpersonation = ref(false)
const { searchTerm: dashboardSearchTerm, loading: dashboardSearchLoading, groups: dashboardSearchGroups } = useDashboardSearch()
const dashboard = useDashboardSite()
const platformTheme = usePlatformTheme()
const organizationsState = authClient.useListOrganizations()

if (import.meta.client) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystemThemeChange = () => platformTheme.sync()

  onMounted(() => platformTheme.restore())
  prefersDark.addEventListener('change', onSystemThemeChange)
  const stopThemeWatch = watch(platformTheme.preference, platformTheme.sync)

  onBeforeUnmount(() => {
    prefersDark.removeEventListener('change', onSystemThemeChange)
    stopThemeWatch()
  })
}

watch(
  () => sessionData.value?.user?.id ?? null,
  userId => setUserId(userId),
  { immediate: true },
)

const dashboardContextErrors = shallowRef<Record<string, unknown>>({})
const dashboardContextError = computed(() =>
  dashboard.contextKey.value
    ? dashboardContextErrors.value[dashboard.contextKey.value] ?? null
    : null,
)
let dashboardContextController: AbortController | null = null

function setDashboardContextError(scopeKey: string, error: unknown) {
  if (!scopeKey) return
  dashboardContextErrors.value = { ...dashboardContextErrors.value, [scopeKey]: error }
}

function clearDashboardContextError(scopeKey: string) {
  if (!scopeKey || !(scopeKey in dashboardContextErrors.value)) return
  dashboardContextErrors.value = Object.fromEntries(
    Object.entries(dashboardContextErrors.value)
      .filter(([key]) => key !== scopeKey),
  )
}

// Matches the H3Error createError({ statusCode: 403 }) thrown by
// assertDashboardPathPermission (server/utils/member-access.ts) when a
// scoped role (editor/member) hits an organization-wide dashboard path.
function isDashboardPermissionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'statusCode' in error
    && (error as { statusCode?: unknown }).statusCode === 403
}

const dashboardContextErrorMessage = computed(() =>
  getErrorMessage(dashboardContextError.value, 'Dashboard context request failed'),
)
const dashboardContextRequestId = computed(() =>
  dashboardContextError.value instanceof ApiClientError
    ? dashboardContextError.value.requestId
    : null,
)

async function retryDashboardContext() {
  const requestedScope = dashboard.contextKey.value
  if (!requestedScope) return
  clearDashboardContextError(requestedScope)
  dashboardContextController?.abort()
  const controller = new AbortController()
  dashboardContextController = controller
  try {
    await dashboard.refresh(controller.signal)
  } catch (error) {
    if (!controller.signal.aborted && dashboard.contextKey.value === requestedScope) {
      setDashboardContextError(requestedScope, error)
    }
  } finally {
    if (dashboardContextController === controller) dashboardContextController = null
  }
}

const organization = dashboard.organization
const site = dashboard.site
const sites = dashboard.sites
const activeSiteId = dashboard.siteId
const canManageOrganization = computed(() => ['owner', 'admin'].includes(organization.value?.role ?? ''))
const dashboardLocation = useDashboardLocation()

const organizations = computed<readonly AuthOrganization[]>(() => unref(organizationsState)?.data ?? [])
const activeOrganizationId = computed(() => {
  const session = sessionData.value?.session as { activeOrganizationId?: string | null } | undefined
  return session?.activeOrganizationId ?? null
})
// The account pages are user-scoped, not organization-scoped, so they carry no
// organization in the path. They used to carry one in the query string purely so
// a back-link could render a label without a fetch; the top nav is the way back
// now, and the session's active organization answers "back to which org?".
const accountOrganization = computed(() => organizations.value.find(org => org.id === activeOrganizationId.value)
  ?? organizations.value[0]
  ?? null)
const impersonatedBy = computed(() => {
  const session = sessionData.value?.session as { impersonatedBy?: string } | undefined
  return session?.impersonatedBy
})

const orgSlug = computed(() => organization.value?.slug ?? null)
const orgBase = computed(() => orgSlug.value ? `/dashboard/${orgSlug.value}` : null)

const siteSlugFromRoute = computed(() => {
  const slug = route.params.siteSlug
  return typeof slug === 'string' ? slug : null
})
// Route-strict, deliberately: every site/location-scoped page carries these
// segments in its own path, so falling back to residual dashboard-context state
// (e.g. the last-viewed site/location) would misclassify scope at org/site root
// once that state has been populated from an earlier page in the same session.
const activeSiteSlug = computed(() => siteSlugFromRoute.value)
const siteBase = computed(() => orgBase.value && activeSiteSlug.value ? `${orgBase.value}/sites/${activeSiteSlug.value}` : null)
// locationsBase is the dedicated site locations index and the prefix for a
// specific location's own routes.
const locationsBase = computed(() => siteBase.value ? `${siteBase.value}/locations` : null)
const currentLocationSlug = dashboardLocation.routeLocationSlug
const locationBase = computed(() => locationsBase.value && currentLocationSlug.value ? `${locationsBase.value}/${currentLocationSlug.value}` : null)
const routeName = computed(() => typeof route.name === 'string' ? route.name : '')
const isAccountRoute = computed(() => routeName.value.startsWith('dashboard-account'))
const isAdminRoute = computed(() => routeName.value.startsWith('admin'))

const vertical = computed(() => {
  const raw = site.value?.vertical
  if (!raw) return null
  return normalizeVertical(raw) as SiteVertical
})
const templateSlug = computed(() => vertical.value ? resolvePublicTemplate({ vertical: vertical.value }).slug : null)
const currentLocationRow = computed(() => dashboard.locations.value.find(l => l.slug === currentLocationSlug.value) ?? null)
// The resolved definition always reflects BOTH the site's own override and, once drilled into a
// location, that location's override too — a single resolveCmsCapabilities call feeds nav at
// every scope rather than each scope re-deriving its own partial capability view.
const capabilities = computed(() => {
  if (!vertical.value || !templateSlug.value) return null
  try {
    return resolveCmsCapabilities(vertical.value, templateSlug.value, {
      site: parseCmsFeatureOverrideDelta(site.value?.feature_overrides),
      location: currentLocationSlug.value ? parseCmsFeatureOverrideDelta(currentLocationRow.value?.feature_overrides) : undefined,
    })
  } catch {
    return null
  }
})

const organizationLabel = computed(() => organization.value?.name ?? 'Organization')

const siteLabel = computed(() => site.value?.brand_name ?? site.value?.subdomain ?? 'No site')
const siteAvatar = (candidate: (typeof sites.value)[number] | undefined) => {
  const media = candidate?.media.find(item => item.slot === 'media')
  return media?.thumbnail_url || media?.public_url || undefined
}
// Progressive drill-in: exactly one scope is active per route, and the sidebar's
// single ContextSwitcher (this dropdown) and NavigationGroups both key off it —
// there is no separate sidebar shell per scope, only scope-driven content inside
// the one stable header/nav slots (see issue #316's "one stable sidebar" rule).
const scope = computed<'organization' | 'site' | 'location'>(() => {
  if (currentLocationSlug.value) return 'location'
  if (activeSiteSlug.value) return 'site'
  return 'organization'
})

// One reusable scope-header model feeds both the desktop sidebar and the mobile
// navbar leading control. Detail pages may override it with an explicit index
// parent, but scope navigation never infers a parent from browser history.
const scopeHeaderModel = computed<DashboardScopeHeaderModel>(() => {
  if (scope.value === 'site' || scope.value === 'location') {
    const currentSite = sites.value.find(candidate => candidate.id === site.value?.id)
    const currentSiteAvatar = siteAvatar(currentSite)
    return {
      scope: 'site',
      current: {
        label: siteLabel.value,
        avatar: currentSiteAvatar,
        icon: currentSiteAvatar ? undefined : 'i-lucide-globe'
      },
      parent: scope.value === 'location' && siteBase.value
        ? { label: siteLabel.value, to: siteBase.value }
        : orgBase.value ? { label: organizationLabel.value, to: orgBase.value } : null,
      peers: sites.value.map((s) => ({
        label: s.brand_name ?? s.subdomain ?? s.id,
        avatar: siteAvatar(s),
        icon: siteAvatar(s) ? undefined : 'i-lucide-globe',
        active: s.subdomain === activeSiteSlug.value,
        to: orgBase.value && s.subdomain ? `${orgBase.value}/sites/${s.subdomain}` : undefined
      })),
      createAction: orgBase.value && canManageOrganization.value
        ? { label: 'New Site', to: `${orgBase.value}/sites/new` }
        : undefined
    }
  }

  return {
    scope: 'organization',
    current: {
      label: organizationLabel.value,
      avatar: organization.value?.logo ?? undefined,
      icon: organization.value?.logo ? undefined : 'i-lucide-building-2'
    },
    parent: null,
    peers: organizations.value.map((org) => ({
      label: org.name,
      avatar: org.logo ?? undefined,
      icon: org.logo ? undefined : 'i-lucide-building-2',
      active: org.id === organization.value?.id,
      to: `/dashboard/${encodeURIComponent(org.slug)}`
    })),
    createAction: { label: 'New Organization', to: '/dashboard/onboarding' }
  }
})

// The children label comes from the resolved capabilities (locationVocabulary), not a
// hardcoded string, so a professional_service site correctly reads "Offices / Service
// Areas" instead of "Locations".
const locationsNavLabel = computed(() => capabilities.value?.locationVocabulary === 'office/service area' ? 'Offices / Service Areas' : 'Locations')
const locationsNavTarget = computed(() => {
  if (!locationsBase.value) return null
  if (scope.value === 'location') return locationBase.value
  const firstLocation = dashboard.locations.value[0]
  return firstLocation?.slug ? `${locationsBase.value}/${firstLocation.slug}` : `${locationsBase.value}/new`
})

provide(dashboardScopeHeaderModelKey, scopeHeaderModel)
provide(dashboardOrganizationParentKey, computed(() => {
  const target = isAccountRoute.value ? accountOrganization.value : organization.value ?? accountOrganization.value
  return target ? { label: target.name, to: `/dashboard/${encodeURIComponent(target.slug)}` } : null
}))

interface DashboardMobileNavItem {
  key: string
  label: string
  icon: string
  to?: string
  active?: boolean
  exact?: boolean
}

function isActivePath(path?: string, exact = false) {
  if (!path) return false
  return route.path === path || (!exact && route.path.startsWith(`${path}/`))
}

const mobileNavItems = computed<DashboardMobileNavItem[]>(() => {
  const routeOrgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  if (!routeOrgSlug) return []
  const routeOrgBase = `/dashboard/${encodeURIComponent(routeOrgSlug)}`
  const routeSiteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
  const routeSiteBase = routeSiteSlug ? `${routeOrgBase}/sites/${encodeURIComponent(routeSiteSlug)}` : null
  const routeLocationSlug = typeof route.params.locationSlug === 'string' ? route.params.locationSlug : null
  const routeLocationBase = routeSiteBase && routeLocationSlug
    ? `${routeSiteBase}/locations/${encodeURIComponent(routeLocationSlug)}`
    : null
  const isOrganization = scope.value === 'organization'
  const childrenTo = isOrganization ? `${routeOrgBase}/sites` : locationsNavTarget.value
  const inboxTo = isOrganization
    ? `${routeOrgBase}/inbox`
    : scope.value === 'location' && routeLocationBase
      ? `${routeLocationBase}/inbox`
      : routeSiteBase ? `${routeSiteBase}/inbox` : undefined
  const items: DashboardMobileNavItem[] = [
    { key: 'today', label: 'Today', icon: 'i-lucide-bookmark', to: routeOrgBase, exact: true },
    { key: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar-days', to: `${routeOrgBase}/calendar` },
    { key: 'children', label: isOrganization ? 'Sites' : locationsNavLabel.value, icon: isOrganization ? 'i-lucide-globe' : 'i-lucide-map-pin', to: childrenTo ?? undefined },
    { key: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox', to: inboxTo },
  ]
  return items.map(item => ({ ...item, active: isActivePath(item.to, item.exact) }))
})

// The top nav (tablet and desktop, md and up) and the bottom bar (mobile, below
// md) render the same list — one nav source, two presentations. useDashboardMenu
// owns which list that is, so admin is a different link set, not a second layout.
// "Menu" opens the slideover at md and up and navigates to the menu page below
// it, because a slideover is the wrong control on a phone.
const menuOpen = ref(false)
const { primaryNavItems: adminPrimaryNavItems, menuPageTo } = useDashboardMenu()
const primaryNavItems = computed(() => adminPrimaryNavItems.value ?? mobileNavItems.value)
const showDashboardChrome = computed(() => primaryNavItems.value.length > 0 && !isAccountRoute.value)
const topNavHomeTo = computed(() => {
  if (isAdminRoute.value) return '/admin'
  const routeOrgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  return routeOrgSlug ? `/dashboard/${encodeURIComponent(routeOrgSlug)}` : '/dashboard'
})
const isMenuPageActive = computed(() => isActivePath(menuPageTo.value, isAdminRoute.value))

watch(
  () => dashboard.contextKey.value,
  async (nextContextKey, previousContextKey) => {
    dashboardContextController?.abort()
    dashboardContextController = null
    if (!nextContextKey) return
    clearDashboardContextError(nextContextKey)
    if (nextContextKey === previousContextKey || dashboard.state.value) return
    const controller = new AbortController()
    dashboardContextController = controller
    try {
      await dashboard.refresh(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted && dashboard.contextKey.value === nextContextKey) {
        setDashboardContextError(nextContextKey, error)
      }
    } finally {
      if (dashboardContextController === controller) dashboardContextController = null
    }
  },
)

// Load dashboard context during SSR so nav links render stable org-scoped routes.
if ((routeName.value.startsWith('dashboard') || isAdminRoute.value) && !dashboard.state.value) {
  const requestedScope = dashboard.contextKey.value
  try {
    await dashboard.refresh()
  } catch (error) {
    // A role-permission denial (assertDashboardPathPermission) isn't a transient
    // failure a retry banner can recover from — it must surface as a real HTTP
    // error on the initial SSR response, not a soft 200 with a "try again" state.
    // Only during SSR: once the page has already rendered (onMounted/watch
    // below), the same denial is shown as an inline banner instead, since a full
    // error page would be worse UX for an in-app navigation the user just made.
    if (import.meta.server && isDashboardPermissionError(error)) throw error
    if (requestedScope && dashboard.contextKey.value === requestedScope) {
      setDashboardContextError(requestedScope, error)
    }
  }
}

onMounted(async () => {
  if ((routeName.value.startsWith('dashboard') || isAdminRoute.value) && !dashboard.state.value && !dashboardContextError.value) {
    dashboardContextController?.abort()
    const controller = new AbortController()
    dashboardContextController = controller
    try {
      await dashboard.refresh(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted && dashboard.contextKey.value) {
        setDashboardContextError(dashboard.contextKey.value, error)
      }
    } finally {
      if (dashboardContextController === controller) dashboardContextController = null
    }
  }

  // Track dashboard visit
  if (activeSiteId.value) {
    trackDashboardVisited(scope.value, activeSiteId.value)
  }
})

onBeforeUnmount(() => {
  dashboardContextController?.abort()
  dashboardContextController = null
})

async function stopImpersonating() {
  stoppingImpersonation.value = true
  try {
    const result = await authClient.admin.stopImpersonating()
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo('/admin/users')
  } catch (error) {
    console.error('Failed to stop impersonation:', error)
    toast.add({
      title: 'Error',
      description: 'Failed to stop impersonation',
      color: 'error'
    })
  } finally {
    stoppingImpersonation.value = false
  }
}

</script>
