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
        <span v-if="impersonationError" class="text-xs text-error font-medium">{{ impersonationError }}</span>
        <UButton size="xs" color="warning" variant="soft" :loading="stoppingImpersonation" @click="stopImpersonating">
          Stop impersonating
        </UButton>
      </div>
    </div>

    <div
      v-if="context.error.value"
      class="flex min-h-screen items-center justify-center bg-default px-6"
      data-testid="dashboard-context-error"
    >
      <UCard class="w-full max-w-xl">
        <h1 class="text-xl font-semibold text-highlighted">Dashboard context could not be loaded</h1>
        <p class="mt-3 text-sm text-muted">{{ dashboardContextErrorMessage }}</p>
        <p v-if="dashboardContextRequestId" class="mt-2 text-xs text-dimmed">
          Request ID: {{ dashboardContextRequestId }}
        </p>
        <UButton class="mt-6" @click="retryDashboardContext">
          Try again
        </UButton>
      </UCard>
    </div>
    <div
      v-else-if="!contextReady"
      class="flex min-h-screen items-center justify-center bg-default px-6"
      data-testid="dashboard-context-loading"
    >
      <div class="w-full max-w-xl space-y-4">
        <div class="h-7 w-48 animate-pulse rounded bg-elevated" />
        <div class="h-32 animate-pulse rounded-xl bg-elevated" />
      </div>
    </div>

    <div v-else>
    <DashboardTopNav
      :items="showNavChrome ? primaryNavItems : []"
      :home-to="topNavHomeTo"
      @menu="menuOpen = true"
    />

    <!--
      The group sits above the nav chrome, not below it. UDashboardGroup is
      `position: fixed`, which makes it a stacking context, so anything inside it
      composites at the group's level no matter how high its own z-index is. With
      the navs at z-40 a leaf sheet at z-50 still painted underneath them. The
      group's box is inset away from both navs, so nothing overlaps in the normal
      case; only an element that deliberately spans the viewport reaches them.
    -->
    <UDashboardGroup
      :ui="{ base: ['z-40', showNavChrome ? 'md:top-(--kc-dashboard-top-nav) max-md:bottom-(--kc-dashboard-bottom-nav)' : 'top-(--kc-dashboard-top-nav)'].join(' ') }"
    >
      <UDashboardSearch v-model:search-term="dashboardSearchTerm" :groups="dashboardSearchGroups" :loading="dashboardSearchLoading" :color-mode="false" />

      <slot />
    </UDashboardGroup>

    <nav
      v-if="showNavChrome"
      class="fixed inset-x-0 bottom-0 z-30 flex h-(--kc-dashboard-bottom-nav) items-stretch border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden"
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
import { useAnalytics } from '~/composables/useAnalytics'
import '~/assets/css/dashboard.css'
import { mediaStillUrl } from '~/shared/media-placement-contract'

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
const router = useRouter()
const session = authClient.useSession()
const sessionData = computed(() => session.value.data)
const refreshSession = () => session.value.refetch()
const { trackDashboardVisited, setUserId } = useAnalytics()
const impersonationError = ref<string | null>(null)
const stoppingImpersonation = ref(false)
const { searchTerm: dashboardSearchTerm, loading: dashboardSearchLoading, groups: dashboardSearchGroups } = useDashboardSearch()
// This layout owns the context request. Nothing below it starts one.
const context = useDashboardContextOwner()
const dashboard = useDashboardSite()
// The page renders once the result held is the one for the destination route.
// A refresh keeps the same-scope result in place, so the page stays mounted; a
// scope change holds the previous scope's result until the new one lands, so
// the page waits.
const contextReady = computed(() => context.data.value?.key === context.contextKey.value)
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


const dashboardContextErrorMessage = computed(() =>
  getErrorMessage(context.error.value, 'Dashboard context request failed'),
)
const dashboardContextRequestId = computed(() =>
  context.error.value instanceof ApiClientError
    ? context.error.value.requestId
    : null,
)

const retryDashboardContext = () => context.refresh()

const organization = dashboard.organization
const site = dashboard.site
const sites = dashboard.sites
const activeSiteId = dashboard.siteId
const canManageOrganization = computed(() => ['owner', 'admin'].includes(organization.value?.role ?? ''))

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
const realtimeOrganizationSlug = computed(() => {
  const slug = router.currentRoute.value.params.orgSlug
  return !stoppingImpersonation.value && typeof slug === 'string' ? slug : null
})
provideDashboardInvalidations(realtimeOrganizationSlug)
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
// Read straight off the route for navigation and routing purposes
const routeLocationSlug = computed(() => typeof route.params.locationSlug === 'string' ? route.params.locationSlug : null)
const routeName = computed(() => typeof route.name === 'string' ? route.name : '')
const isAccountRoute = computed(() => routeName.value.startsWith('dashboard-account'))
const organizationLabel = computed(() => organization.value?.name ?? 'Organization')

const siteLabel = computed(() => site.value?.brand_name ?? site.value?.subdomain ?? 'No site')
const siteAvatar = (candidate: (typeof sites.value)[number] | undefined) => {
  const media = candidate?.media.find(item => item.slot === 'media')
  return mediaStillUrl(media) || undefined
}
// Progressive drill-in: exactly one scope is active per route, and the sidebar's
// single ContextSwitcher (this dropdown) and NavigationGroups both key off it —
// there is no separate sidebar shell per scope, only scope-driven content inside
// the one stable header/nav slots (see issue #316's "one stable sidebar" rule).
const scope = computed<'organization' | 'site' | 'location'>(() => {
  if (routeLocationSlug.value) return 'location'
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

/**
 * Only the most specific matching item is active. Nav paths nest — a location's
 * Messages lives under the Locations path — so plain prefix matching lit up both
 * Messages and Locations at once. The longest matching path is the one the route
 * actually belongs to.
 */
function withActiveItem<T extends { to?: string; exact?: boolean }>(items: T[]): Array<T & { active: boolean }> {
  const depths = items.map(item => isActivePath(item.to, item.exact) ? (item.to?.length ?? 0) : -1)
  const deepest = Math.max(...depths)
  return items.map((item, index) => ({ ...item, active: depths[index] === deepest && depths[index] >= 0 }))
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
  const messagesTo = scope.value === 'location' && routeLocationBase
    ? `${routeLocationBase}/messages`
    : routeSiteBase ? `${routeSiteBase}/messages` : `${routeOrgBase}/messages`
  const items: DashboardMobileNavItem[] = [
    { key: 'today', label: 'Today', icon: 'i-lucide-bookmark', to: routeOrgBase, exact: true },
    { key: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar-days', to: `${routeOrgBase}/calendar` },
    { key: 'children', label: 'Sites', icon: 'i-lucide-globe', to: `${routeOrgBase}/sites` },
    { key: 'messages', label: 'Messages', icon: 'i-lucide-message-square', to: messagesTo },
  ]
  return withActiveItem(items)
})

// The top nav (tablet and desktop, md and up) and the bottom bar (mobile, below
// md) render the same list — one nav source, two presentations. useDashboardMenu
// owns which list that is.
// "Menu" opens the slideover at md and up and navigates to the menu page below
// it, because a slideover is the wrong control on a phone.
const menuOpen = ref(false)
const { menuPageTo } = useDashboardMenu()
const primaryNavItems = computed(() => mobileNavItems.value)
// A signed-in owner always gets the header: the wordmark and the account menu
// are user-scoped and need no organization. Only the nav links and the bottom
// bar wait for an organization, because Today, Calendar, Sites and Messages do not
// exist until there is one. Gating both together is what left an owner who
// abandoned onboarding with no way to reach account settings or log out.
const showNavChrome = computed(() => primaryNavItems.value.length > 0 && !isAccountRoute.value)
const topNavHomeTo = computed(() => {
  const routeOrgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  return routeOrgSlug ? `/dashboard/${encodeURIComponent(routeOrgSlug)}` : '/dashboard'
})
const isMenuPageActive = computed(() => isActivePath(menuPageTo.value))



onMounted(async () => {
  // Track dashboard visit
  if (activeSiteId.value) {
    trackDashboardVisited(scope.value, activeSiteId.value)
  }
})

async function stopImpersonating() {
  impersonationError.value = null
  stoppingImpersonation.value = true
  try {
    const result = await authClient.admin.stopImpersonating()
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (error) {
    console.error('Failed to stop impersonation:', error)
    impersonationError.value = 'Failed to stop impersonation'
  } finally {
    stoppingImpersonation.value = false
  }
}

</script>
