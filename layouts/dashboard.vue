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

    <UDashboardGroup v-else unit="rem" :min-size="14" :default-size="18" :max-size="24">
      <UDashboardSidebar
        v-model:collapsed="sidebarCollapsed"
        resizable
        collapsible
        class="hidden lg:flex"
        :menu="{ close: false }"
        :ui="{ root: 'h-dvh min-h-0 max-h-dvh bg-elevated', header: 'h-auto min-h-(--ui-header-height) items-start py-2.5', body: 'min-h-0 overflow-y-auto px-3 py-1', content: 'bg-elevated' }"
      >
        <template #header="{ collapsed }">
          <DashboardScopeHeader :model="scopeHeaderModel" :collapsed="collapsed" />
        </template>

        <template #default="{ collapsed }">
          <div class="flex flex-col gap-2">
            <UDashboardSearchButton
              :collapsed="collapsed"
              label="Search dashboard, docs, help..."
              :kbds="[]"
              class="w-full"
            />
            <UNavigationMenu
              :collapsed="collapsed"
              :items="navigationItems"
              orientation="vertical"
              :ui="{ link: 'hover:before:bg-accented/80 hover:text-highlighted before:transition-colors' }"
            />
          </div>
        </template>

        <template #footer="{ collapsed }">
          <div class="flex flex-col w-full gap-1.5">
            <DashboardAccountMenu :collapsed="collapsed" />
          </div>
        </template>
      </UDashboardSidebar>

      <UDashboardSearch v-model:search-term="dashboardSearchTerm" :groups="dashboardSearchGroups" :loading="dashboardSearchLoading" :color-mode="false" />

      <slot />

      <ChowBot v-if="showChowBot" />
    </UDashboardGroup>

    <div
      v-if="mobileNavItems.length && !isAccountRoute"
      class="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 lg:hidden"
      data-testid="dashboard-mobile-nav"
    >
      <nav class="flex h-[52px] w-full max-w-[420px] items-center justify-around rounded-full border border-default bg-elevated px-2 shadow-[0_10px_24px_rgba(20,23,46,0.2)]">
        <UButton
          v-for="item in mobileNavItems"
          :key="item.key"
          :to="item.to"
          :icon="item.icon"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          :aria-label="item.label"
          :title="item.label"
          :class="item.active ? 'bg-primary/10 text-primary' : 'text-dimmed'"
        />
        <DashboardAccountMenu mobile-only />
      </nav>
    </div>

    <BillingServiceUpsellModal />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import ChowBot from '~/lib/components/workspace/dashboard/ChowBot.vue'
import DashboardScopeHeader from '~/lib/components/workspace/dashboard/DashboardScopeHeader.vue'
import type { DashboardScopeHeaderModel } from '~/lib/components/workspace/dashboard/DashboardScopeHeader.vue'
import { dashboardAccountRouteQueryKey, dashboardOrganizationParentKey, dashboardScopeHeaderModelKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'
import { useAnalytics } from '~/composables/useAnalytics'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type CmsManagerCapability, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import '~/assets/css/dashboard.css'

// ─────────────────────────────────────────────────────────────────────────
// Dashboard shell architecture (issue #316 + its "Authoritative clarification:
// progressive sidebar scope navigation" comment — read that comment before
// changing anything here, it settles a design dispute this file went through).
//
// Invariants that must hold no matter what gets added later:
// - Exactly one layout, one <UDashboardSidebar>, one <UNavigationMenu>. Never
//   fork a second sidebar/layout per scope, per vertical, or per feature.
// - `scope` is derived ONLY from explicit route params (locationSlug > siteSlug
//   > orgSlug), never from route.path regexes, residual dashboard-context state,
//   or a "last visited" fallback — those misclassify scope at ancestor routes
//   once state has been populated from a deeper page in the same session.
// - Nav is strictly scope-exclusive: a manager only appears when its OWN
//   registry `scope` matches the current drill-in level (see managerNavItems).
//   Site items must not leak into location scope and vice versa — this was a
//   real bug here once, caused by checking "does siteBase/locationBase exist"
//   instead of "does the manager's scope match the CURRENT scope".
// - At lg and above, the parent row is a normal UNavigationMenu item built from
//   scopeHeaderModel.parent. Below lg the same model is provided to
//   DashboardNavbarLeading because the sidebar is hidden.
// - New verticals/templates need zero changes here — add the combination to
//   cmsCapabilityRegistry and nav/capabilities update automatically. A new
//   manager id (not just a new vertical reusing existing ids) needs an entry
//   in MANAGER_GROUP/MANAGER_ICON below, nothing else.
// ─────────────────────────────────────────────────────────────────────────

interface AuthOrganization {
  id: string
  name: string
  slug: string
  logo?: string | null
}

const route = useRoute()
const _config = useRuntimeConfig()
const sidebarCollapsed = useState<boolean>('dashboard-sidebar-collapsed', () => false)
const { data: sessionData, refreshSession, signOut: _signOut } = useAuth()
const { trackDashboardVisited, setUserId } = useAnalytics()
const toast = useToast()
const stoppingImpersonation = ref(false)
const { searchTerm: dashboardSearchTerm, loading: dashboardSearchLoading, groups: dashboardSearchGroups } = useDashboardSearch()
const dashboard = useDashboardSite()
const _chowBot = useChowBot()
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
const canManageSite = computed(() => dashboard.siteAccess.value === 'organization' || dashboard.siteAccess.value === 'site')
const canManageOrganization = computed(() => ['owner', 'admin'].includes(organization.value?.role ?? ''))
const dashboardLocation = useDashboardLocation()

const organizations = computed<readonly AuthOrganization[]>(() => unref(organizationsState)?.data ?? [])
const requestedAccountOrganizationSlug = computed(() => {
  const slug = routeName.value.startsWith('dashboard-account') ? route.query.organization : null
  return typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug) ? slug : null
})
const requestedAccountOrganizationName = computed(() => {
  const name = routeName.value.startsWith('dashboard-account') ? route.query.organizationName : null
  return typeof name === 'string' && name.trim().length <= 100 ? name.trim() : null
})
const activeOrganizationId = computed(() => {
  const session = sessionData.value?.session as { activeOrganizationId?: string | null } | undefined
  return session?.activeOrganizationId ?? null
})
const accountOrganization = computed(() => organizations.value.find(org => org.slug === requestedAccountOrganizationSlug.value)
  ?? organizations.value.find(org => org.id === activeOrganizationId.value)
  ?? organizations.value[0]
  ?? null)
const accountRouteQuery = computed((): Record<string, string> => {
  const target = accountOrganization.value
  if (!target?.slug) return {}
  return { organization: target.slug, organizationName: target.name }
})
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
const isConversationsRoute = computed(() => routeName.value.includes('conversations'))
const showChowBot = computed(() => !isConversationsRoute.value
  && (dashboard.siteAccess.value !== 'location' || scope.value === 'location'))

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

type NavGroupId = 'Content' | 'Operate' | 'Reputation' | 'Publishing'

// A NEW VERTICAL never requires touching this layout: add its combination to
// verticalDefaultFeatures (config/cms-registry.ts) and nav updates automatically
// via resolveCmsCapabilities. The one exception is a genuinely NEW feature id
// (not just a new vertical using existing ids like products/reviews/blog) — that
// needs an entry in both maps below. managerNavItems filters on
// `MANAGER_GROUP[manager.id] !== group`, so a ProductFeature missing from this map
// matches no group at all and is omitted from every group's nav — not rendered
// with a missing icon, simply never rendered.
// 'locations' and 'settings' are deliberately absent — they're always-on infra
// features rendered directly by overviewGroup/siteOverviewGroup/locationOverviewGroup
// below, not through the toggleable manager nav.
const MANAGER_GROUP: Partial<Record<ProductFeature, NavGroupId>> = {
  media: 'Content',
  links: 'Content',
  posts: 'Content',
  photos: 'Content',
  products: 'Operate',
  ordering: 'Operate',
  reservations: 'Operate',
  experiences: 'Operate',
  services: 'Operate',
  testimonials: 'Reputation',
  reviews: 'Reputation',
  qa: 'Reputation',
  blog: 'Publishing',
}

const MANAGER_ICON: Partial<Record<ProductFeature, string>> = {
  media: 'i-lucide-image',
  links: 'i-lucide-link',
  posts: 'i-lucide-megaphone',
  photos: 'i-lucide-image',
  products: 'i-lucide-package',
  ordering: 'i-lucide-shopping-bag',
  reservations: 'i-lucide-calendar-check',
  experiences: 'i-lucide-ticket',
  services: 'i-lucide-briefcase',
  testimonials: 'i-lucide-star',
  reviews: 'i-lucide-star',
  qa: 'i-lucide-message-circle-question',
  blog: 'i-lucide-pencil',
}

function managerHref(manager: CmsManagerCapability): string | null {
  if (manager.id === 'settings') {
    if (manager.scope === 'location') return locationBase.value ? `${locationBase.value}/settings` : null
    return siteBase.value ? `${siteBase.value}/settings` : null
  }
  if (manager.scope === 'location') {
    if (!locationBase.value) return null
    const rel = manager.route.replace(/^:location\/?/, '')
    return rel ? `${locationBase.value}/${rel}` : locationBase.value
  }
  if (!siteBase.value) return null
  return manager.route ? `${siteBase.value}/${manager.route}` : siteBase.value
}

// Strict scope-exclusivity: a manager only appears in nav when its OWN
// registry scope ('site' | 'location') matches the current drill-in level.
// Without this, a manager still resolves an href whenever siteBase/locationBase
// merely *exist* — which they do at every deeper scope too — so site-scoped
// items (Blog, Reviews, Settings) would keep showing while drilled into a
// location, and org-level items would keep showing at site scope. Each scope
// must show only its own level's nav, not the union of it and its ancestors.
function managerNavItems(group: NavGroupId) {
  const managers = capabilities.value?.managers ?? []
  const seen = new Set<string>()
  const items: { label: string; icon?: string; to: string }[] = []
  for (const manager of managers) {
    if (scope.value === 'site' && !canManageSite.value) continue
    if (MANAGER_GROUP[manager.id] !== group) continue
    if (manager.scope !== scope.value) continue
    const href = managerHref(manager)
    if (!href || seen.has(href)) continue
    seen.add(href)
    items.push({ label: manager.label, icon: MANAGER_ICON[manager.id], to: href })
  }
  return items
}

function _managerAction(manager: CmsManagerCapability, href: string) {
  return {
    label: manager.label,
    to: href,
    icon: MANAGER_ICON[manager.id] ?? 'i-lucide-circle',
    feature: manager.id,
  }
}

function _revenueLabel(item: ReturnType<typeof _managerAction>) {
  if (item.feature === 'reservations') return 'Bookings'
  if (item.feature === 'services') return 'Schedule'
  return item.label
}

const organizationNavigationItems = computed(() => {
  if (!orgBase.value) return []
  return [
    { key: 'today', label: 'Today', icon: 'i-lucide-bookmark', to: orgBase.value },
    { key: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar-days', to: `${orgBase.value}/calendar` },
    { key: 'sites', label: 'Sites', icon: 'i-lucide-globe', to: `${orgBase.value}/sites` },
    { key: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox', to: `${orgBase.value}/inbox` },
  ]
})

const _overviewGroup = computed(() => {
  if (scope.value !== 'organization' || !orgBase.value) return []
  return organizationNavigationItems.value.map(({ key: _key, ...item }) => item)
})

// The parent row renders as a plain UNavigationMenu item (same size/padding as
// every other item) rather than custom-styled markup in the switcher header —
// guarantees visual consistency by construction instead of hand-matching CSS.
function parentNavItem() {
  const parent = scopeHeaderModel.value.parent
  return parent ? [{ label: parent.label, icon: 'i-lucide-chevron-left', to: parent.to }] : []
}

// 'locations' and 'settings' are always-on infra features (see MANAGER_GROUP's comment) so they
// render here directly rather than through managerNavItems — the label still comes from the
// resolved capabilities (locationVocabulary), not a hardcoded string, so a professional_service
// site correctly reads "Offices / Service Areas" instead of "Locations".
const locationsNavLabel = computed(() => capabilities.value?.locationVocabulary === 'office/service area' ? 'Offices / Service Areas' : 'Locations')
const locationsNavTarget = computed(() => {
  if (!locationsBase.value) return null
  if (scope.value === 'location') return locationBase.value
  const firstLocation = dashboard.locations.value[0]
  return firstLocation?.slug ? `${locationsBase.value}/${firstLocation.slug}` : `${locationsBase.value}/new`
})

const _siteOverviewGroup = computed(() => {
  if (scope.value !== 'site' || !siteBase.value) return []
  const items = [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: siteBase.value },
    { label: 'Inbox', icon: 'i-lucide-inbox', to: `${siteBase.value}/inbox` },
    { label: locationsNavLabel.value, icon: 'i-lucide-map-pin', to: locationsNavTarget.value ?? `${siteBase.value}/locations/new` },
  ]
  if (!canManageSite.value) return items
  return [
    ...items,
    { label: 'Assistant', icon: 'i-lucide-bot', to: `${siteBase.value}/conversations` },
    { label: 'Analytics', icon: 'i-lucide-chart-bar', to: `${siteBase.value}/analytics` },
    { label: 'Domains', icon: 'i-lucide-globe', to: `${siteBase.value}/domains` },
    { label: 'Settings', icon: 'i-lucide-settings', to: `${siteBase.value}/settings` },
  ]
})

// Posts/Photos/Q&A used to be hardcoded here regardless of capability — moved to
// managerNavItems('Content'/'Reputation') (location.posts/location.photos/location.qa in
// config/cms-registry.ts) so a location override can actually turn them off. Overview/Content/
// Inbox/Settings stay here: universal chrome with no ProductFeature toggle.
const _locationOverviewGroup = computed(() => {
  if (scope.value !== 'location' || !locationBase.value) return []
  return [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: locationBase.value },
    { label: 'Location settings', icon: 'i-lucide-settings', to: `${locationBase.value}/settings` },
    ...(siteBase.value && canManageSite.value ? [{ label: 'Pages', icon: 'i-lucide-file-text', to: `${siteBase.value}/pages` }] : []),
    { label: 'Inbox', icon: 'i-lucide-inbox', to: `${locationBase.value}/inbox` },
  ]
})

const _parentGroup = computed(() => parentNavItem())

const _contentGroup = computed(() => {
  const items: { label: string; icon?: string; to?: string; type?: string }[] = []
  const managerItems = managerNavItems('Content')
  if (scope.value === 'site' && siteBase.value && canManageSite.value) {
    items.push({ label: 'Content', type: 'label' })
    items.push({ label: 'Pages', icon: 'i-lucide-file-text', to: `${siteBase.value}/pages` })
  }
  if (managerItems.length > 0) {
    if (items.length === 0) items.push({ label: 'Content', type: 'label' })
    items.push(...managerItems)
  }
  return items
})

const _operateGroup = computed(() => {
  const items = managerNavItems('Operate')
  if (items.length === 0) return items
  return [{ label: 'Operate', type: 'label' }, ...items]
})
const _reputationGroup = computed(() => {
  const items = managerNavItems('Reputation')
  if (items.length === 0) return items
  return [{ label: 'Reputation', type: 'label' }, ...items]
})
const _publishingGroup = computed(() => {
  const items = managerNavItems('Publishing')
  if (items.length === 0) return items
  return [{ label: 'Publishing', type: 'label' }, ...items]
})

const settingsGroup = computed(() => {
  if (routeName.value.startsWith('dashboard-account')) {
    return [
      { label: 'Account', type: 'label' },
      { label: 'Profile', icon: 'i-lucide-user', to: { path: '/dashboard/account/profile', query: accountRouteQuery.value } },
      { label: 'Authentication', icon: 'i-lucide-shield', to: { path: '/dashboard/account/authentication', query: accountRouteQuery.value } },
    ]
  }
  return []
})


const adminGroup = computed(() => [
  ...(dashboard.managedServiceEnabled.value ? [{ label: 'Work Queue', icon: 'i-lucide-list-todo', to: '/admin/work' }] : []),
  { label: 'Clients', icon: 'i-lucide-building-2', to: '/admin/clients' },
  { label: 'Members', icon: 'i-lucide-user-plus', to: '/admin/members' },
  { label: 'Analytics', icon: 'i-lucide-chart-bar', to: '/admin/analytics' },
  { label: 'Domains', icon: 'i-lucide-globe', to: '/admin/domains' },
  { label: 'Users', icon: 'i-lucide-users', to: '/admin/users' },
  { label: 'Content', icon: 'i-lucide-file-text', to: '/admin/content' },
  { label: 'Blog', icon: 'i-lucide-pencil', to: '/admin/blog' },
  { label: 'Docs', icon: 'i-lucide-book-open', to: '/admin/docs' },
])

const navigationItems = computed(() => {
  if (isAdminRoute.value) return [adminGroup.value]
  if (routeName.value.startsWith('dashboard-account')) return [settingsGroup.value]
  return [
    mobileNavItems.value
      .filter(item => !(scope.value === 'site' && ['children', 'inbox'].includes(item.key))
        && !(scope.value === 'location' && item.key === 'inbox'))
      .map(({ key: _key, active: _active, exact: _exact, ...item }) => item),
    _siteOverviewGroup.value,
    _locationOverviewGroup.value,
  ]
})
provide(dashboardScopeHeaderModelKey, scopeHeaderModel)
provide(dashboardOrganizationParentKey, computed(() => {
  const target = isAccountRoute.value ? accountOrganization.value : organization.value ?? accountOrganization.value
  if (target) return { label: target.name, to: `/dashboard/${encodeURIComponent(target.slug)}` }
  return requestedAccountOrganizationSlug.value
    ? {
        label: requestedAccountOrganizationName.value ?? requestedAccountOrganizationSlug.value,
        to: `/dashboard/${encodeURIComponent(requestedAccountOrganizationSlug.value)}`,
      }
    : null
}))
provide(dashboardAccountRouteQueryKey, accountRouteQuery)

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
