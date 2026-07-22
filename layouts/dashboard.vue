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

    <UDashboardGroup unit="rem" :min-size="14" :default-size="18" :max-size="24">
      <UDashboardSidebar
        v-model:collapsed="sidebarCollapsed"
        resizable
        collapsible
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
    <BillingCreditPurchaseModal />
    <BillingServiceUpsellModal />
    <BillingSiteSubscribeModal />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import ChowBot from '~/components/workspace/dashboard/ChowBot.vue'
import DashboardScopeHeader from '~/components/workspace/dashboard/DashboardScopeHeader.vue'
import type { DashboardScopeHeaderModel } from '~/components/workspace/dashboard/DashboardScopeHeader.vue'
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'
import { useAnalytics } from '~/composables/useAnalytics'
import { resolveCmsCapabilities, type CmsManagerCapability, type CmsManagerId } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

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
  slug?: string | null
  logo?: string | null
}

const route = useRoute()
const sidebarCollapsed = useState<boolean>('dashboard-sidebar-collapsed', () => false)
const { data: sessionData, refreshSession } = useAuth()
const { trackDashboardVisited } = useAnalytics()
const toast = useToast()
const stoppingImpersonation = ref(false)
const { searchTerm: dashboardSearchTerm, loading: dashboardSearchLoading, groups: dashboardSearchGroups } = useDashboardSearch()
const dashboard = useDashboardSite()
const organizationsState = authClient.useListOrganizations()

const dashboardContextError = ref<unknown>(null)

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

const vertical = computed(() => (site.value?.vertical ?? null) as SiteVertical | null)
const templateSlug = computed(() => vertical.value ? resolvePublicTemplate({ vertical: vertical.value }).slug : null)
const capabilities = computed(() => {
  if (!vertical.value || !templateSlug.value) return null
  try {
    return resolveCmsCapabilities(vertical.value, templateSlug.value)
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
      onSelect: () => switchOrganization(org.id)
    })),
    createAction: { label: 'New Organization', to: '/dashboard/onboarding' }
  }
})

type NavGroupId = 'Content' | 'Operate' | 'Reputation' | 'Publishing'

// A NEW VERTICAL never requires touching this layout: add its combination to
// cmsCapabilityRegistry (config/cms-registry.ts) and nav updates automatically
// via resolveCmsCapabilities. The one exception is a genuinely NEW manager id
// (not just a new vertical using existing ids like menu/reviews/blog) — that
// needs an entry in both maps below, or it silently renders with no group/icon.
const MANAGER_GROUP: Partial<Record<CmsManagerId, NavGroupId>> = {
  media: 'Content',
  tenant_pages: 'Content',
  compliance: 'Content',
  menu: 'Operate',
  reservations: 'Operate',
  experiences: 'Operate',
  offerings: 'Operate',
  reviews: 'Reputation',
  qa: 'Reputation',
  blog: 'Publishing',
}

const MANAGER_ICON: Partial<Record<CmsManagerId, string>> = {
  media: 'i-lucide-image',
  tenant_pages: 'i-lucide-file-text',
  compliance: 'i-lucide-shield-check',
  menu: 'i-lucide-utensils',
  reservations: 'i-lucide-calendar-check',
  experiences: 'i-lucide-ticket',
  offerings: 'i-lucide-briefcase',
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

const overviewGroup = computed(() => {
  if (scope.value !== 'organization' || !orgBase.value) return []
  return [
    { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: orgBase.value },
    { label: 'Sites', icon: 'i-lucide-globe', to: `${orgBase.value}/sites` },
    ...(canManageOrganization.value ? [
      { label: 'Activity', icon: 'i-lucide-activity', to: `${orgBase.value}/activity` },
    // Org settings (general/domains/members/billing) are organization-level,
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

const siteOverviewGroup = computed(() => {
  if (scope.value !== 'site' || !siteBase.value) return []
  const items = [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: siteBase.value },
    { label: 'Locations', icon: 'i-lucide-map-pin', to: locationsBase.value ?? `${siteBase.value}/locations` },
  ]
  if (!canManageSite.value) return items
  return [
    ...items,
    { label: 'Orders', icon: 'i-lucide-shopping-bag', to: `${siteBase.value}/orders` },
    { label: 'Assistant', icon: 'i-lucide-bot', to: `${siteBase.value}/conversations` },
    { label: 'Settings', icon: 'i-lucide-settings', to: `${siteBase.value}/settings` },
    // { label: 'Translations', icon: 'i-lucide-languages', to: `${siteBase.value}/translations` },
  ]
})

const locationOverviewGroup = computed(() => {
  if (scope.value !== 'location' || !locationBase.value) return []
  return [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: locationBase.value },
    ...(canManageSite.value ? [{ label: 'Analytics', icon: 'i-lucide-chart-bar', to: `${locationBase.value}/analytics` }] : []),
    { label: 'Content', icon: 'i-lucide-file-text', to: `${locationBase.value}/content` },
    { label: 'Posts', icon: 'i-lucide-megaphone', to: `${locationBase.value}/posts` },
    { label: 'Photos', icon: 'i-lucide-image', to: `${locationBase.value}/photos` },
    { label: 'Q&A', icon: 'i-lucide-message-circle-question', to: `${locationBase.value}/qa` },
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

async function switchOrganization(organizationId: string) {
  const organizationApi = authClient.organization as unknown as {
    setActive?: (_input: { organizationId: string }) => Promise<unknown>
  }
  await organizationApi.setActive?.({ organizationId })
  await dashboard.refresh()
  await navigateTo('/dashboard')
}

// Load dashboard context during SSR so nav links render stable org-scoped routes.
if ((routeName.value.startsWith('dashboard') || isAdminRoute.value) && !dashboard.state.value) {
  try {
    await dashboard.refresh()
  } catch (error) {
    dashboardContextError.value = error
  }
}

onMounted(async () => {
  if ((routeName.value.startsWith('dashboard') || isAdminRoute.value) && !dashboard.state.value && !dashboardContextError.value) {
    await dashboard.refresh()
  }

  // Track dashboard visit
  if (activeSiteId.value) {
    trackDashboardVisited(scope.value, activeSiteId.value)
  }
})

async function stopImpersonating() {
  stoppingImpersonation.value = true
  try {
    await $fetch('/api/admin/impersonation/stop', { method: 'POST' })
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
