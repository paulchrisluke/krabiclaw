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
      :ui="{ base: ['z-40', showNavChrome ? 'md:top-(--kc-dashboard-top-nav)' : 'top-(--kc-dashboard-top-nav)', showBottomNav ? 'max-md:bottom-(--kc-dashboard-bottom-nav)' : ''].join(' ') }"
    >
      <UDashboardSearch
        v-model:open="dashboardSearchOpen"
        v-model:search-term="dashboardSearchTerm"
        title="Search"
        description="Search this business"
        placeholder="Search…"
        size="lg"
        :fullscreen="isPhoneWidth"
        :groups="dashboardSearchGroups"
        :loading="dashboardSearchLoading"
        :color-mode="false"
      />

      <slot />
    </UDashboardGroup>

    <nav
      v-if="showBottomNav"
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

    <!-- A refused organization switch stays on screen: the session did not move. -->
    <UAlert
      v-if="organizationSwitchError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      class="fixed inset-x-4 top-4 z-50 mx-auto max-w-md"
      :description="organizationSwitchError"
      :close="{ onClick: () => (organizationSwitchError = null) }"
    />

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
import { useMediaQuery } from '@vueuse/core'

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
// The Menu's Search row and a list's search icon open the same palette ⌘K does.
// Registered for this layout's lifetime only: a hook left behind by an earlier
// mount toggled the palette a second time and cancelled the first.
const dashboardSearchOpen = ref(false)
// On a phone the palette is the screen, like every other sheet here; on a wide screen it is a card.
const isPhoneWidth = useMediaQuery('(max-width: 767px)')
const nuxtApp = useNuxtApp()
let unhookSearchToggle: (() => void) | null = null
onMounted(() => {
  unhookSearchToggle = nuxtApp.hooks.hook('dashboard:search:toggle', () => { dashboardSearchOpen.value = !dashboardSearchOpen.value })
})
onBeforeUnmount(() => { unhookSearchToggle?.(); unhookSearchToggle = null })
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

const organizations = computed<readonly AuthOrganization[]>(() => unref(organizationsState)?.data ?? [])
const activeOrganizationId = computed(() => {
  const session = sessionData.value?.session as { activeOrganizationId?: string | null } | undefined
  return session?.activeOrganizationId ?? null
})
// The account pages are user-scoped, not organization-scoped, so they carry no
// organization in the path, and the session's active organization answers
// "back to which org?".
//
// Only that one. Falling back to the first organization the account belongs to
// sent Back from Account into a business the person had never opened — it read
// as an answer while being a guess. With no active organization there is no
// parent, and the level renders no Back rather than a wrong one.
//
// Setting the active organization is #905's work, not this change's: it belongs
// to `/api/post-login` and to explicit selection in the scope switcher, never to
// a side effect of visiting an organization's route.
const accountOrganization = computed(() => organizations.value.find(org => org.id === activeOrganizationId.value) ?? null)

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
// The organization is the business, and the business's mark is its brand logo.
const organizationAvatar = computed(() => organization.value?.logo
  ?? mediaStillUrl(sites.value[0]?.media.find(item => item.slot === 'logo'))
  ?? undefined)

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
    }
  }

  return {
    scope: 'organization',
    current: {
      label: organizationLabel.value,
      avatar: organizationAvatar.value,
      icon: organizationAvatar.value ? undefined : 'i-lucide-building-2'
    },
    parent: null,
    peers: organizations.value.map((org) => ({
      label: org.name,
      avatar: org.logo ?? undefined,
      icon: org.logo ? undefined : 'i-lucide-building-2',
      active: org.id === organization.value?.id,
      // Which one is a plain link is the *session's* question, not the route's.
      // A route can be open in an organization the session is not active in —
      // that is the case #905 exists for — and comparing against the route left
      // that peer as a link that never told Better Auth anything.
      ...(org.id === activeOrganizationId.value
        ? { to: `/dashboard/${encodeURIComponent(org.slug)}` }
        : { onSelect: () => void selectOrganization(org) }),
    })),
    createAction: { label: 'New Organization', to: '/dashboard/onboarding' }
  }
})



/**
 * Switching businesses activates the organization in Better Auth first, then
 * navigates. Navigating first left the session pointing at the old one, which
 * is what the account pages read to find their way back (#905).
 */
const organizationSwitchError = ref<string | null>(null)
// One activation at a time. Two quick presses raced: both called `setActive`,
// and whichever resolved last decided the session while the other was already
// navigating — the dashboard could open an organization the session left.
const switchingOrganization = ref(false)
async function selectOrganization(org: { id: string, slug: string }) {
  if (switchingOrganization.value) return
  switchingOrganization.value = true
  organizationSwitchError.value = null
  try {
    await activateOrganization(org)
  } finally {
    switchingOrganization.value = false
  }
}

async function activateOrganization(org: { id: string, slug: string }) {
  const { error } = await authClient.organization.setActive({ organizationId: org.id })
  if (error) {
    // Staying put is the honest outcome: the session is still in the old
    // organization, so entering the new one would show a dashboard the session
    // is not actually in.
    organizationSwitchError.value = error.message || 'Could not switch organization'
    return
  }
  await session.value.refetch()
  await navigateTo(`/dashboard/${encodeURIComponent(org.slug)}`)
}

provide(dashboardScopeHeaderModelKey, scopeHeaderModel)
provide(dashboardOrganizationParentKey, computed(() => {
  const target = isAccountRoute.value ? accountOrganization.value : organization.value ?? accountOrganization.value
  return target ? { label: target.name, to: `/dashboard/${encodeURIComponent(target.slug)}/settings` } : null
}))

interface DashboardMobileNavItem {
  key: string
  label: string
  icon: string
  to?: string
  active?: boolean
}

/**
 * Which tab the current route belongs to: the one reached by walking up from
 * here the way Back does, following `meta.back` where a page declares a parent
 * the URL does not nest under and cutting a segment otherwise.
 *
 * Prefix matching cannot answer this. The links page lives at
 * `/sites/:siteSlug/links` but is reached from Pages, under Menu, so the URL
 * said Locations while every way out of it led to Menu. Asking the same
 * question Back asks means the lit tab is always the one the walk ends at.
 */
function tabRootPath(stops: readonly string[]): string | null {
  let path = route.path
  const seen = new Set<string>()
  while (!seen.has(path)) {
    // The walk ends at the first tab it reaches. Menu declares no parent of its
    // own, so without this it kept cutting segments and every page under it lit
    // Today.
    if (stops.includes(path)) return path
    seen.add(path)
    const resolved = router.resolve(path)
    // A directory's `index.vue` is a second record at the same URL and the same
    // level, and it is the one `matched` ends on. Both are asked, so the `back:`
    // its directory declares is not missed — which is what sent every page
    // under Menu to Locations instead.
    const depth = (candidate: string) => candidate.split('/').filter(Boolean).length
    const deepest = Math.max(...resolved.matched.map(candidate => depth(candidate.path)))
    const declared = resolved.matched
      .filter(candidate => depth(candidate.path) === deepest && candidate.meta?.passthrough !== true)
      .map(candidate => candidate.meta?.back)
      .find(candidate => typeof candidate === 'string')
    if (typeof declared === 'string') {
      const target = router.getRoutes().find(candidate => candidate.name === declared)
      const keys = target ? [...target.path.matchAll(/:(\w+)/g)].map(match => match[1]!) : []
      if (target && keys.every(key => resolved.params[key] !== undefined)) {
        path = router.resolve({ name: declared, params: Object.fromEntries(keys.map(key => [key, resolved.params[key]])) }).path
        continue
      }
    }
    const above = path.split('/').filter(Boolean).slice(0, -1)
    // `/dashboard/:orgSlug` is Today, and there is nothing above it to walk to.
    if (above.length < 2) break
    path = `/${above.join('/')}`
  }
  return stops.includes(path) ? path : null
}



/**
 * A tab is active when the walk above ends at it. Two tabs could otherwise
 * claim one route, because their paths nest: a location's Messages lives under
 * the Locations path.
 */
function withActiveItem<T extends { to?: string }>(items: T[], root: string | null): Array<T & { active: boolean }> {
  return items.map(item => ({ ...item, active: Boolean(item.to) && item.to === root }))
}

/** The tabs themselves; which one is lit is answered after they are known. */
const navTargets = computed<DashboardMobileNavItem[]>(() => {
  const routeOrgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  if (!routeOrgSlug) return []
  const routeOrgBase = `/dashboard/${encodeURIComponent(routeOrgSlug)}`
  const routeSiteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
  const routeSiteBase = routeSiteSlug ? `${routeOrgBase}/sites/${encodeURIComponent(routeSiteSlug)}` : null
  const messagesTo = routeSiteBase ? `${routeSiteBase}/messages` : `${routeOrgBase}/messages`
  const items: DashboardMobileNavItem[] = [
    { key: 'today', label: 'Today', icon: 'i-lucide-bookmark', to: routeOrgBase },
    { key: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar-days', to: `${routeOrgBase}/calendar` },
    { key: 'locations', label: 'Locations', icon: 'i-lucide-map-pin', to: `${routeOrgBase}/sites` },
    { key: 'messages', label: 'Messages', icon: 'i-lucide-message-square', to: messagesTo },
  ]
  return items
})

// The top nav (tablet and desktop, md and up) and the bottom bar (mobile, below
// md) render the same list — one nav source, two presentations. useDashboardMenu
// owns which list that is.
// "Menu" opens the slideover at md and up and navigates to the menu page below
// it, because a slideover is the wrong control on a phone.
const menuOpen = ref(false)
const { menuPageTo } = useDashboardMenu()

/** Every tab the walk may end at, Menu included. */
const tabStops = computed(() => [
  ...navTargets.value.map(item => item.to).filter((to): to is string => Boolean(to)),
  menuPageTo.value,
])
const activeTabPath = computed(() => tabRootPath(tabStops.value))
const primaryNavItems = computed(() => withActiveItem(navTargets.value, activeTabPath.value))
// A signed-in owner always gets the header: the wordmark and the account menu
// are user-scoped and need no organization. Only the nav links and the bottom
// bar wait for an organization, because Today, Calendar, Sites and Messages do not
// exist until there is one. Gating both together is what left an owner who
// abandoned onboarding with no way to reach account settings or log out.
const showNavChrome = computed(() => primaryNavItems.value.length > 0 && !isAccountRoute.value)
// A leaf with Cancel/Save is a sheet on a phone: the tab bar is not there
// under it, the way Airbnb's editor leaves cover theirs.
const leafFooters = useDashboardLeafFooters()
const showBottomNav = computed(() => showNavChrome.value && leafFooters.value === 0)
const topNavHomeTo = computed(() => {
  const routeOrgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  return routeOrgSlug ? `/dashboard/${encodeURIComponent(routeOrgSlug)}` : '/dashboard'
})
// Menu is lit by the same walk as the other tabs, so a page reached through it
// — Pages, Blog, Website, and every level under them — lights Menu and nothing else.
const isMenuPageActive = computed(() => activeTabPath.value === menuPageTo.value)



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
