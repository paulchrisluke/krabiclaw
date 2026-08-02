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
        class="hidden md:flex"
        :menu="{ close: false }"
        :ui="{ root: 'bg-elevated', header: 'h-auto min-h-(--ui-header-height) items-start py-2.5', body: 'px-3 py-1', content: 'bg-elevated' }"
      >
        <template #header="{ collapsed }">
          <DashboardScopeHeader :model="scopeHeaderModel" :collapsed="collapsed" />
        </template>

        <template #default="{ collapsed }">
          <div class="flex flex-col gap-2">
            <UDashboardSearchButton
              :collapsed="collapsed"
              label="Search dashboard, docs, help..."
              class="w-full"
            />
            <UNavigationMenu
              :collapsed="collapsed"
              :items="navigationItems"
              orientation="vertical"
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
      v-if="mobileNavItems.length"
      class="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 md:hidden"
      data-testid="dashboard-mobile-nav"
    >
      <nav class="flex h-[52px] w-full max-w-[420px] items-center justify-around rounded-full border border-default bg-elevated px-2 shadow-[0_10px_24px_rgba(20,23,46,0.2)]">
        <UDashboardSearchButton
          label="Search dashboard"
          class="flex size-9 items-center justify-center rounded-full text-dimmed"
          :ui="{ base: 'size-9 justify-center rounded-full px-0', label: 'sr-only' }"
        />
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
        <UButton
          icon="i-lucide-ellipsis"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="More"
          title="More"
          :class="mobileMoreOpen ? 'bg-primary/10 text-primary' : 'text-dimmed'"
          @click="toggleMobileMore"
        />
        <UButton
          icon="i-lucide-bot"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          aria-label="ChowBot"
          title="ChowBot"
          class="text-dimmed"
          @click="openChowBot"
        />
      </nav>
    </div>

    <button
      v-if="mobileMoreOpen"
      type="button"
      class="fixed inset-0 z-30 bg-black/30 md:hidden"
      aria-label="Close navigation menu"
      @click="mobileMoreOpen = false"
    />
    <div
      v-if="mobileMoreOpen"
      ref="mobileMoreSheetRef"
      class="fixed inset-x-3 bottom-20 z-40 rounded-xl border border-default bg-elevated p-2 shadow-xl md:hidden"
      data-testid="dashboard-mobile-more"
      role="dialog"
      aria-modal="true"
      aria-label="Dashboard navigation"
      tabindex="-1"
      @keydown="onMobileMoreKeydown"
    >
      <div class="max-h-[55vh] overflow-y-auto">
        <div class="border-b border-default px-3 py-3">
          <p class="truncate text-sm font-semibold text-highlighted">{{ sessionData?.user?.name || 'User' }}</p>
          <p class="mt-0.5 truncate text-xs text-muted">{{ sessionData?.user?.email }}</p>
        </div>
        <NuxtLink
          v-for="item in mobileMoreItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-highlighted hover:bg-muted"
          @click="closeMobileMore"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="size-4 text-muted" />
          <span>{{ item.label }}</span>
        </NuxtLink>
        <div class="mt-2 border-t border-default pt-2">
          <NuxtLink
            v-for="item in mobileAccountItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-highlighted hover:bg-muted"
            :target="item.target"
            @click="closeMobileMore"
          >
            <UIcon :name="item.icon" class="size-4 text-muted" />
            <span>{{ item.label }}</span>
          </NuxtLink>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-error hover:bg-error/10"
            @click="handleMobileSignOut"
          >
            <UIcon name="i-lucide-log-out" class="size-4" />
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </div>

    <BillingCreditPurchaseModal />
    <BillingServiceUpsellModal />
    <BillingSiteSubscribeModal />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import ChowBot from '~/lib/components/workspace/dashboard/ChowBot.vue'
import DashboardScopeHeader from '~/lib/components/workspace/dashboard/DashboardScopeHeader.vue'
import type { DashboardScopeHeaderModel } from '~/lib/components/workspace/dashboard/DashboardScopeHeader.vue'
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'
import { useAnalytics } from '~/composables/useAnalytics'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type CmsManagerCapability, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

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
// - The parent ("← back") row is a normal UNavigationMenu item built from
//   scopeHeaderModel.parent, not custom-styled markup living in the switcher
//   header — this guarantees identical sizing/spacing to every other nav item
//   by construction instead of hand-matching CSS.
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
const config = useRuntimeConfig()
const sidebarCollapsed = useState<boolean>('dashboard-sidebar-collapsed', () => false)
const { data: sessionData, refreshSession, signOut } = useAuth()
const { trackDashboardVisited } = useAnalytics()
const toast = useToast()
const stoppingImpersonation = ref(false)
const { searchTerm: dashboardSearchTerm, loading: dashboardSearchLoading, groups: dashboardSearchGroups } = useDashboardSearch()
const dashboard = useDashboardSite()
const chowBot = useChowBot()
const organizationsState = authClient.useListOrganizations()
const mobileMoreOpen = ref(false)
const mobileMoreButtonElement = ref<HTMLElement | null>(null)
const mobileMoreSheetRef = ref<HTMLElement | null>(null)
const mobileMoreFocusReturn = ref<HTMLElement | null>(null)

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
const settingsBase = computed(() => orgBase.value ? `${orgBase.value}/settings` : null)

const routeName = computed(() => typeof route.name === 'string' ? route.name : '')
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
// Progressive drill-in: exactly one scope is active per route, and the sidebar's
// single ContextSwitcher (this dropdown) and NavigationGroups both key off it —
// there is no separate sidebar shell per scope, only scope-driven content inside
// the one stable header/nav slots (see issue #316's "one stable sidebar" rule).
const scope = computed<'organization' | 'site' | 'location'>(() => {
  if (currentLocationSlug.value) return 'location'
  if (activeSiteSlug.value) return 'site'
  return 'organization'
})

// One reusable scope-header model, per issue #316's authoritative clarification:
// the parent row is a visible, always-present part of this single component at
// every scope — never a menu item, never a separate per-scope implementation.
const scopeHeaderModel = computed<DashboardScopeHeaderModel>(() => {
  if (scope.value === 'site' || scope.value === 'location') {
    return {
      scope: 'site',
      current: { label: siteLabel.value, icon: 'i-lucide-globe' },
      parent: scope.value === 'location' && siteBase.value
        ? { label: siteLabel.value, to: siteBase.value }
        : orgBase.value ? { label: organizationLabel.value, to: orgBase.value } : null,
      peers: sites.value.map((s) => ({
        label: s.brand_name ?? s.subdomain ?? 'Site',
        icon: 'i-lucide-globe',
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
// (not just a new vertical using existing ids like menu/reviews/blog) — that
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
  menu: 'Operate',
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
  menu: 'i-lucide-utensils',
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

function managerAction(manager: CmsManagerCapability, href: string) {
  return {
    label: manager.label,
    to: href,
    icon: MANAGER_ICON[manager.id] ?? 'i-lucide-circle',
    feature: manager.id,
  }
}

function revenueLabel(item: ReturnType<typeof managerAction>) {
  if (item.feature === 'reservations') return 'Bookings'
  if (item.feature === 'services') return 'Schedule'
  return item.label
}

const overviewGroup = computed(() => {
  if (scope.value !== 'organization' || !orgBase.value) return []
  return [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: orgBase.value },
    { label: 'Sites', icon: 'i-lucide-globe', to: `${orgBase.value}/sites` },
    ...(canManageOrganization.value ? [
      { label: 'Activity', icon: 'i-lucide-activity', to: `${orgBase.value}/activity` },
    // Org settings (general/members/billing) are organization-level,
    // not site-level, so they belong here regardless of the CMS registry's
    // per-site 'settings' manager (a distinct, site-scoped branding/SEO
    // concern handled by managerNavItems('Settings') at site scope instead).
      { label: 'Settings', icon: 'i-lucide-settings', to: settingsBase.value ?? `${orgBase.value}/settings` },
    ] : []),
  ]
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

const siteOverviewGroup = computed(() => {
  if (scope.value !== 'site' || !siteBase.value) return []
  const items = [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: siteBase.value },
    { label: 'Inbox', icon: 'i-lucide-inbox', to: `${siteBase.value}/inbox` },
    { label: locationsNavLabel.value, icon: 'i-lucide-map-pin', to: locationsBase.value ?? `${siteBase.value}/locations` },
  ]
  if (!canManageSite.value) return items
  return [
    ...items,
    { label: 'Assistant', icon: 'i-lucide-bot', to: `${siteBase.value}/conversations` },
    { label: 'Domains', icon: 'i-lucide-globe', to: `${siteBase.value}/domains` },
    { label: 'Settings', icon: 'i-lucide-settings', to: `${siteBase.value}/settings` },
    // { label: 'Translations', icon: 'i-lucide-languages', to: `${siteBase.value}/translations` },
  ]
})

// Posts/Photos/Q&A used to be hardcoded here regardless of capability — moved to
// managerNavItems('Content'/'Reputation') (location.posts/location.photos/location.qa in
// config/cms-registry.ts) so a location override can actually turn them off. Overview/Content/
// Inbox/Settings stay here: universal chrome with no ProductFeature toggle.
const locationOverviewGroup = computed(() => {
  if (scope.value !== 'location' || !locationBase.value) return []
  return [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: locationBase.value },
    ...(canManageSite.value ? [{ label: 'Analytics', icon: 'i-lucide-chart-bar', to: `${locationBase.value}/analytics` }] : []),
    { label: 'Content', icon: 'i-lucide-file-text', to: `${locationBase.value}/content` },
    { label: 'Inbox', icon: 'i-lucide-inbox', to: `${locationBase.value}/inbox` },
    { label: 'Settings', icon: 'i-lucide-settings', to: `${locationBase.value}/settings` },
  ]
})

const parentGroup = computed(() => parentNavItem())

const contentGroup = computed(() => {
  const items: { label: string; icon?: string; to?: string; type?: string }[] = []
  const managerItems = managerNavItems('Content')
  if (managerItems.length > 0) {
    items.push({ label: 'Content', type: 'label' })
    items.push(...managerItems)
  } else if (scope.value === 'site' && siteBase.value && canManageSite.value) {
    // Location scope doesn't need this fallback — locationOverviewGroup
    // already has its own Content entry; siteOverviewGroup has none, so
    // site scope still needs it here.
    items.push({ label: 'Content', icon: 'i-lucide-copy', to: `${siteBase.value}/content` })
  }
  return items
})

const operateGroup = computed(() => {
  const items = managerNavItems('Operate')
  if (items.length === 0) return items
  return [{ label: 'Operate', type: 'label' }, ...items]
})
const reputationGroup = computed(() => {
  const items = managerNavItems('Reputation')
  if (items.length === 0) return items
  return [{ label: 'Reputation', type: 'label' }, ...items]
})
const publishingGroup = computed(() => {
  const items = managerNavItems('Publishing')
  if (items.length === 0) return items
  return [{ label: 'Publishing', type: 'label' }, ...items]
})

const settingsGroup = computed(() => {
  if (routeName.value.startsWith('dashboard-account')) {
    return [
      { label: 'Account', type: 'label' },
      { label: 'Profile', icon: 'i-lucide-user', to: '/dashboard/account/profile' },
      { label: 'Authentication', icon: 'i-lucide-shield', to: '/dashboard/account/authentication' },
      { label: 'Billing Items', icon: 'i-lucide-receipt', to: '/dashboard/account/billing-items' },
    ]
  }
  return []
})

const adminGroup = computed(() => [
  { label: 'Add-ons', icon: 'i-lucide-inbox', to: '/admin' },
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
  const groups: { label: string; icon?: string; to?: string; type?: string }[][] = []
  if (parentGroup.value.length) groups.push(parentGroup.value)
  if (overviewGroup.value.length) groups.push(overviewGroup.value)
  if (siteOverviewGroup.value.length) groups.push(siteOverviewGroup.value)
  if (locationOverviewGroup.value.length) groups.push(locationOverviewGroup.value)
  if (contentGroup.value.length) groups.push(contentGroup.value)
  if (operateGroup.value.length) groups.push(operateGroup.value)
  if (reputationGroup.value.length) groups.push(reputationGroup.value)
  if (publishingGroup.value.length) groups.push(publishingGroup.value)
  if (settingsGroup.value.length) groups.push(settingsGroup.value)
  return groups
})

interface DashboardMobileNavItem {
  key: string
  label: string
  icon: string
  to: string
  active?: boolean
}

function isActivePath(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

function firstManagerItem(feature: ProductFeature, managerScope = scope.value) {
  const manager = capabilities.value?.managers.find(item => item.id === feature && item.scope === managerScope)
  if (!manager) return null
  const href = managerHref(manager)
  return href ? managerAction(manager, href) : null
}

function firstLocationManagerItem(feature: ProductFeature) {
  if (scope.value === 'site' && !canManageSite.value) return null
  const location = dashboard.locations.value.find(item => item.is_primary) ?? dashboard.locations.value[0]
  if (!vertical.value || !templateSlug.value || !locationsBase.value || !location?.slug) return null
  let locationCapabilities: ReturnType<typeof resolveCmsCapabilities>
  try {
    locationCapabilities = resolveCmsCapabilities(vertical.value, templateSlug.value, {
      site: parseCmsFeatureOverrideDelta(site.value?.feature_overrides),
      location: parseCmsFeatureOverrideDelta(location.feature_overrides),
    })
  } catch {
    return null
  }
  const manager = locationCapabilities.managers.find(item => item.id === feature && item.scope === 'location')
  if (!manager) return null
  const rel = manager.route.replace(/^:location\/?/, '')
  const base = `${locationsBase.value}/${location.slug}`
  return managerAction(manager, rel ? `${base}/${rel}` : base)
}

const mobileRevenueItem = computed<DashboardMobileNavItem | null>(() => {
  if (scope.value === 'organization' && orgBase.value) {
    return {
      key: 'sites',
      label: 'Sites',
      icon: 'i-lucide-globe',
      to: `${orgBase.value}/sites`,
      active: isActivePath(`${orgBase.value}/sites`),
    }
  }

  if (scope.value === 'location') {
    const primary = firstManagerItem('menu', 'location')
      ?? firstManagerItem('experiences', 'location')
    if (!primary) return null
    return {
      key: 'primary',
      label: primary.label,
      icon: primary.icon,
      to: primary.to,
      active: isActivePath(primary.to),
    }
  }

  if (scope.value !== 'site') return null
  const revenue = firstManagerItem('ordering', 'site')
    ?? firstManagerItem('services', 'site')
    ?? firstLocationManagerItem('reservations')
    ?? firstLocationManagerItem('experiences')
  if (!revenue) return null
  return {
    key: 'revenue',
    label: revenueLabel(revenue),
    icon: revenue.icon,
    to: revenue.to,
    active: isActivePath(revenue.to),
  }
})

const mobileHomeItem = computed<DashboardMobileNavItem | null>(() => {
  const to = scope.value === 'location'
    ? locationBase.value
    : scope.value === 'site'
      ? siteBase.value
      : orgBase.value
  if (!to) return null
  return {
    key: 'home',
    label: 'Home',
    icon: 'i-lucide-home',
    to,
    active: route.path === to,
  }
})

const mobileInboxItem = computed<DashboardMobileNavItem | null>(() => {
  if (scope.value === 'organization' && !canManageOrganization.value) return null
  const to = scope.value === 'location'
    ? locationBase.value ? `${locationBase.value}/inbox` : null
    : scope.value === 'site'
      ? siteBase.value ? `${siteBase.value}/inbox` : null
      : orgBase.value ? `${orgBase.value}/activity` : null
  if (!to) return null
  return {
    key: 'inbox',
    label: scope.value === 'organization' ? 'Activity' : 'Inbox',
    icon: scope.value === 'organization' ? 'i-lucide-activity' : 'i-lucide-inbox',
    to,
    active: isActivePath(to),
  }
})

const mobileNavItems = computed<DashboardMobileNavItem[]>(() => [
  mobileHomeItem.value,
  mobileInboxItem.value,
  mobileRevenueItem.value,
].filter((item): item is DashboardMobileNavItem => Boolean(item)))

const mobileMoreItems = computed(() => {
  const seen = new Set<string>()
  const items: { label: string; icon?: string; to: string }[] = []
  const primaryTargets = new Set(mobileNavItems.value.map(item => item.to))

  for (const group of navigationItems.value) {
    for (const item of group) {
      if (('type' in item && item.type === 'label') || !item.to || primaryTargets.has(item.to) || seen.has(item.to)) continue
      seen.add(item.to)
      items.push({ label: item.label, icon: item.icon, to: item.to })
    }
  }

  return items
})

const mobileAccountItems = computed(() => [
  { label: 'Account settings', icon: 'i-lucide-settings', to: '/dashboard/account/profile' },
  { label: 'Authentication', icon: 'i-lucide-shield', to: '/dashboard/account/authentication' },
  ...(config.public.helpUrl ? [{ label: 'Help', icon: 'i-lucide-circle-help', to: config.public.helpUrl as string, target: '_blank' }] : []),
  { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
])

watch(() => route.fullPath, () => {
  mobileMoreOpen.value = false
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

watch(mobileMoreOpen, async (open) => {
  if (open) {
    mobileMoreFocusReturn.value = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : mobileMoreButtonElement.value
    await nextTick()
    const first = mobileMoreFocusableItems()[0]
    if (first) first.focus()
    else mobileMoreSheetRef.value?.focus()
    return
  }

  await nextTick()
  mobileMoreFocusReturn.value?.focus()
  mobileMoreFocusReturn.value = null
})

function openChowBot() {
  mobileMoreOpen.value = false
  chowBot.open()
}

function toggleMobileMore(event: MouseEvent) {
  mobileMoreButtonElement.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  mobileMoreOpen.value = !mobileMoreOpen.value
}

const mobileMoreFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function mobileMoreFocusableItems() {
  if (!mobileMoreSheetRef.value) return []
  return [...mobileMoreSheetRef.value.querySelectorAll<HTMLElement>(mobileMoreFocusableSelector)]
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
}

function closeMobileMore() {
  mobileMoreOpen.value = false
}

async function handleMobileSignOut() {
  const redirect = route.fullPath
  closeMobileMore()
  await signOut()
  await navigateTo({ path: '/login', query: { redirect } })
}

function onMobileMoreKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMobileMore()
    return
  }

  if (event.key !== 'Tab') return
  const focusable = mobileMoreFocusableItems()
  if (focusable.length === 0) {
    event.preventDefault()
    mobileMoreSheetRef.value?.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

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
