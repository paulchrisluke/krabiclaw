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
            <PlatformCommandSearchTrigger
              surface="dashboard"
              :compact="collapsed"
              label="Search dashboard, docs, help..."
              aria-label="Open dashboard search"
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
            <UPopover
              :content="{ align: 'start', collisionPadding: 12, side: 'top', sideOffset: 12 }"
              class="w-full"
              :ui="{ content: 'w-[260px] p-0 overflow-hidden rounded-xl border border-default bg-elevated shadow-xl z-50' }"
            >
              <template #default="{ open }">
                <UButton
                  color="neutral"
                  variant="ghost"
                  class="w-full min-w-0"
                  :class="[
                    open ? 'bg-muted/80' : '',
                    collapsed ? 'justify-center' : 'justify-between'
                  ]"
                  :ui="{ base: 'min-w-0 w-full items-center px-2 py-1.5', leadingAvatar: 'shrink-0' }"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <UAvatar
                      :src="sessionData?.user?.image ?? undefined"
                      :alt="sessionData?.user?.name || 'User avatar'"
                      size="sm"
                      class="shrink-0"
                    />
                    <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left text-sm font-medium text-highlighted">
                      {{ sessionData?.user?.name }}
                    </span>
                  </div>
                  <div
                    v-if="!collapsed"
                    class="size-7 hover:bg-muted rounded-full border border-default flex items-center justify-center text-dimmed shrink-0 transition-colors"
                  >
                    <UIcon name="i-lucide-ellipsis" class="size-4" />
                  </div>
                </UButton>
              </template>

              <template #content="{ close }">
                <div class="flex flex-col text-default divide-y divide-default w-full overflow-hidden">
                  <!-- Header row -->
                  <div class="flex items-center justify-between px-4 py-3 min-w-0 bg-elevated">
                    <div class="flex flex-col min-w-0">
                      <span class="text-sm font-semibold text-highlighted truncate">
                        {{ sessionData?.user?.name || 'User' }}
                      </span>
                      <span class="text-xs text-muted truncate mt-0.5">
                        {{ sessionData?.user?.email }}
                      </span>
                    </div>
                    <UButton
                      to="/dashboard/account/profile"
                      variant="ghost"
                      color="neutral"
                      icon="i-lucide-settings"
                      size="sm"
                      class="text-muted hover:text-highlighted hover:bg-muted shrink-0"
                      @click="close"
                    />
                  </div>

                  <!-- Menu items list -->
                  <div class="p-1 flex flex-col gap-0.5 bg-elevated">
                    <!-- Theme item with segmented control -->
                    <div class="w-full flex items-center justify-between px-3 py-1.5 text-sm font-medium text-default">
                      <span>Theme</span>
                      <div class="bg-muted border border-default p-0.5 rounded-full flex items-center gap-0.5 shadow-inner">
                        <button
                          v-for="pref in ['system', 'light', 'dark'] as const"
                          :key="pref"
                          class="rounded-full size-7 flex items-center justify-center transition-all cursor-pointer"
                          :class="colorMode.preference === pref ? 'bg-elevated text-highlighted shadow-sm border border-default' : 'text-dimmed hover:text-muted'"
                          @click="colorMode.preference = pref"
                        >
                          <UIcon :name="getThemeIcon(pref)" class="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <!-- Help -->
                    <NuxtLink
                      :to="config.public.helpUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-default hover:text-highlighted hover:bg-muted transition-colors text-left"
                      @click="close"
                    >
                      <span>Help</span>
                      <UIcon name="i-lucide-circle-help" class="size-4 text-muted" />
                    </NuxtLink>

                    <!-- Docs -->
                    <NuxtLink
                      to="/docs"
                      class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-default hover:text-highlighted hover:bg-muted transition-colors text-left"
                      @click="close"
                    >
                      <span>Docs</span>
                      <UIcon name="i-lucide-book-open" class="size-4 text-muted" />
                    </NuxtLink>

                    <!-- Log Out -->
                    <button
                      class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-error hover:text-error/85 hover:bg-error/10 transition-colors cursor-pointer text-left"
                      @click="handleSignOut(); close();"
                    >
                      <span>Log Out</span>
                      <UIcon name="i-lucide-log-out" class="size-4 text-error/80" />
                    </button>
                  </div>

                  <!-- Platform Status flat row -->
                  <div class="px-4 py-3 flex items-center justify-between select-none bg-muted/10">
                    <div class="flex flex-col">
                      <span class="text-[10px] text-dimmed uppercase tracking-wider font-semibold">
                        Platform Status
                      </span>
                      <span class="text-xs font-semibold text-highlighted mt-0.5">
                        {{ platformStatus === 'normal' ? 'All systems normal.' : platformStatus === 'loading' ? 'Checking status...' : 'System interruption' }}
                      </span>
                    </div>
                    <!-- glowing status dot -->
                    <span class="relative flex size-2">
                      <span
                        class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                        :class="{
                          'bg-emerald-500': platformStatus === 'normal',
                          'bg-amber-500': platformStatus === 'loading',
                          'bg-red-500': platformStatus === 'error'
                        }"
                      />
                      <span
                        class="relative inline-flex size-2 rounded-full"
                        :class="{
                          'bg-emerald-500': platformStatus === 'normal',
                          'bg-amber-500': platformStatus === 'loading',
                          'bg-red-500': platformStatus === 'error'
                        }"
                      />
                    </span>
                  </div>
                </div>
              </template>
            </UPopover>
          </div>
        </template>
      </UDashboardSidebar>

      <slot />

      <ChowBot v-if="!isConversationsRoute" />
    </UDashboardGroup>
    <PlatformCommandSearchModal surface="dashboard" />
    <BillingCreditPurchaseModal />
    <BillingServiceUpsellModal />
    <BillingSiteSubscribeModal />
    </div>
  </UApp>
</template>

<script setup lang="ts">
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
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
const config = useRuntimeConfig()
const { data: sessionData, signOut, refreshSession } = useAuth()
const { trackDashboardVisited } = useAnalytics()
const toast = useToast()
const stoppingImpersonation = ref(false)
const dashboard = useDashboardSite()
const organizationsState = authClient.useListOrganizations()

const colorMode = useColorMode()

function getThemeIcon(pref: 'system' | 'light' | 'dark') {
  if (pref === 'system') return 'i-lucide-monitor'
  if (pref === 'light') return 'i-lucide-sun'
  return 'i-lucide-moon'
}

const billingStatus = ref<{ billing: { plan: string } } | null>(null)
const platformStatus = ref<'normal' | 'loading' | 'error'>('loading')
const dashboardContextError = ref<unknown>(null)

async function checkPlatformStatus() {
  try {
    const res = await $fetch<{ status: string }>('/api/health')
    platformStatus.value = res.status === 'ok' ? 'normal' : 'error'
  } catch (err) {
    console.error('Failed to fetch platform status:', err)
    platformStatus.value = 'error'
  }
}

const organization = dashboard.organization
const site = dashboard.site
const sites = dashboard.sites
const locations = dashboard.locations
const activeSiteId = dashboard.siteId
const dashboardLocation = useDashboardLocation()
const currentLocation = dashboardLocation.routeLocation

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
// Flat shape, deliberately, matching useDashboardSiteLinks.ts's own reverted
// locationBase: the canonical /sites/:site/locations/:location shape 404s
// until issue #316 phase 4 actually moves pages/dashboard/[orgSlug]/sites/
// [siteSlug]/[locationSlug]/ into that directory. Move the two together.
const locationsBase = computed(() => siteBase.value)
const currentLocationSlug = dashboardLocation.routeLocationSlug
const locationBase = computed(() => siteBase.value && currentLocationSlug.value ? `${siteBase.value}/${currentLocationSlug.value}` : null)
const settingsBase = computed(() => orgBase.value ? `${orgBase.value}/settings` : null)

const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const isConversationsRoute = computed(() => Boolean(siteBase.value) && route.path.startsWith(`${siteBase.value}/conversations`))

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
const locationLabel = computed(() => currentLocation.value?.title ?? 'No locations')

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
  if (scope.value === 'location') {
    return {
      scope: 'location',
      current: { label: locationLabel.value, icon: 'i-lucide-map-pin' },
      parent: siteBase.value ? { label: siteLabel.value, to: siteBase.value } : null,
      peers: locations.value.map((location) => ({
        label: location.title,
        icon: 'i-lucide-map-pin',
        active: location.id === currentLocation.value?.id,
        to: locationsBase.value ? `${locationsBase.value}/${location.slug}` : undefined
      })),
      createAction: siteBase.value ? { label: 'New Location', to: `${siteBase.value}/new` } : undefined
    }
  }

  if (scope.value === 'site') {
    return {
      scope: 'site',
      current: { label: siteLabel.value, icon: 'i-lucide-globe' },
      parent: orgBase.value ? { label: organizationLabel.value, to: orgBase.value } : null,
      peers: sites.value.map((s) => ({
        label: s.brand_name ?? s.subdomain ?? 'Site',
        icon: 'i-lucide-globe',
        active: s.subdomain === activeSiteSlug.value,
        to: orgBase.value && s.subdomain ? `${orgBase.value}/sites/${s.subdomain}` : undefined
      })),
      createAction: orgBase.value ? { label: 'New Site', to: `${orgBase.value}/sites/new` } : undefined
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

type NavGroupId = 'Content' | 'Operate' | 'Reputation' | 'Publishing' | 'Settings'

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
  settings: 'Settings',
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
  settings: 'i-lucide-settings',
}

function managerHref(manager: CmsManagerCapability): string | null {
  if (manager.id === 'settings') return settingsBase.value
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
    { label: 'Activity', icon: 'i-lucide-activity', to: `${orgBase.value}/activity` },
    // Org settings (general/domains/members/billing) are organization-level,
    // not site-level, so they belong here regardless of the CMS registry's
    // per-site 'settings' manager (a distinct, site-scoped branding/SEO
    // concern handled by managerNavItems('Settings') at site scope instead).
    { label: 'Settings', icon: 'i-lucide-settings', to: settingsBase.value ?? `${orgBase.value}/settings` },
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
  return [
    ...parentNavItem(),
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: siteBase.value },
    { label: 'Conversations', icon: 'i-lucide-messages-square', to: `${siteBase.value}/conversations` },
    { label: 'Translations', icon: 'i-lucide-languages', to: `${siteBase.value}/translations` },
  ]
})

const locationOverviewGroup = computed(() => {
  if (scope.value !== 'location' || !locationBase.value) return []
  return [
    ...parentNavItem(),
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: locationBase.value },
    { label: 'Inbox', icon: 'i-lucide-inbox', to: `${locationBase.value}/inbox` },
  ]
})

const contentGroup = computed(() => {
  const items: { label: string; icon?: string; to: string }[] = []
  if (scope.value === 'site' && siteBase.value) items.push({ label: 'Content', icon: 'i-lucide-copy', to: `${siteBase.value}/content` })
  if (scope.value === 'location' && locationBase.value) items.push({ label: 'Content', icon: 'i-lucide-copy', to: `${locationBase.value}/content` })
  items.push(...managerNavItems('Content'))
  return items
})

const operateGroup = computed(() => managerNavItems('Operate'))
const reputationGroup = computed(() => managerNavItems('Reputation'))
const publishingGroup = computed(() => managerNavItems('Publishing'))

const settingsGroup = computed(() => {
  if (route.path.startsWith('/dashboard/account')) {
    return [
      { label: 'Profile', icon: 'i-lucide-user', to: '/dashboard/account/profile' },
      { label: 'Authentication', icon: 'i-lucide-shield', to: '/dashboard/account/authentication' },
      { label: 'Billing Items', icon: 'i-lucide-receipt', to: '/dashboard/account/billing-items' },
    ]
  }
  return managerNavItems('Settings')
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
  const groups: { label: string; icon?: string; to: string }[][] = []
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
if (route.path.startsWith('/dashboard') && !dashboard.state.value) {
  try {
    await dashboard.refresh()
  } catch (error) {
    dashboardContextError.value = error
  }
}

onMounted(async () => {
  if (route.path.startsWith('/dashboard') && !dashboard.state.value && !dashboardContextError.value) {
    await dashboard.refresh()
  }
  checkPlatformStatus().catch(console.error)
  try {
    billingStatus.value = await $fetch<{ billing: { plan: string } }>('/api/billing/status')
  } catch (err) {
    console.error('Failed to load billing status:', err)
  }

  // Track dashboard visit
  const segment = route.path.split('/').filter(Boolean).at(2)
  if (segment && activeSiteId.value) {
    trackDashboardVisited(segment, activeSiteId.value)
  }
})

async function handleSignOut() {
  // Preserve the current path across sign-out/sign-back-in like
  // middleware/account.ts and middleware/dashboard.global.ts already do for
  // session-expiry redirects, so a manager who explicitly logs out from a
  // notification deep link lands back on the same thread after signing in
  // again rather than the generic dashboard root.
  const redirect = route.fullPath
  await signOut()
  await navigateTo({ path: '/login', query: { redirect } })
}

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
