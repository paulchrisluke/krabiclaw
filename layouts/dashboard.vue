<template>
  <UApp>
    <div class="platform-theme" :class="{ 'dashboard-has-impersonation-banner': impersonatedBy }">
      <div v-if="impersonatedBy" class="dashboard-impersonation-banner pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 sm:left-1/2 sm:right-auto sm:w-1/3 sm:-translate-x-1/2 sm:px-0">
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

      <div v-else class="dashboard-shell flex min-h-dvh flex-col bg-default">
        <header class="dashboard-shell-header shrink-0 border-b border-default bg-default">
          <div class="mx-auto flex min-h-16 w-full items-center gap-2 px-3 sm:px-5 lg:grid lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] lg:gap-6 lg:px-6">
            <DashboardScopeHeader :model="scopeHeaderModel" class="min-w-0 flex-1 lg:w-full lg:max-w-64" />

            <UNavigationMenu
              v-if="primaryNavigation.kind === 'available'"
              :items="primaryNavigation.items"
              orientation="horizontal"
              aria-label="Primary navigation"
              class="hidden lg:flex"
              :ui="{ link: 'min-h-11 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' }"
            />

            <div class="ml-auto flex min-w-0 items-center justify-end gap-2">
              <UDashboardSearchButton
                collapsed
                label="Search dashboard, docs, help..."
                :kbds="[]"
                class="min-h-11 min-w-11 lg:hidden"
              />
              <UDashboardSearchButton
                label="Search"
                :kbds="[]"
                class="hidden min-h-11 min-w-36 lg:flex"
              />
              <DashboardAccountMenu placement="desktop-top" class="hidden lg:block" />
            </div>
          </div>
        </header>

        <UDashboardGroup class="dashboard-shell-content min-h-0 flex-1" unit="rem" :min-size="14" :default-size="18" :max-size="24">
          <UDashboardSearch v-model:search-term="dashboardSearchTerm" :groups="dashboardSearchGroups" :loading="dashboardSearchLoading" :color-mode="false" />
          <slot />
          <ChowBot v-if="showChowBot" />
        </UDashboardGroup>

        <nav
          class="dashboard-mobile-navigation fixed inset-x-0 bottom-0 z-40 border-t border-default bg-default lg:hidden"
          aria-label="Primary navigation"
          data-testid="dashboard-mobile-nav"
        >
          <div class="mx-auto flex min-h-16 w-full max-w-xl items-stretch px-1">
            <NuxtLink
              v-for="item in primaryNavigation.items"
              :key="item.key"
              :to="item.to"
              class="flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-xs font-medium text-muted outline-none transition-colors hover:bg-elevated hover:text-highlighted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              :class="item.active ? 'text-primary' : ''"
              :aria-current="item['aria-current']"
            >
              <UIcon :name="item.icon" class="size-5" />
              <span>{{ item.label }}</span>
            </NuxtLink>
            <DashboardAccountMenu placement="mobile-bottom" class="min-w-11 flex-1" />
          </div>
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
import { resolveDashboardPrimaryNavigation, type DashboardPrimaryNavigationContext } from '~/utils/dashboard-navigation'
import '~/assets/css/dashboard.css'

interface AuthOrganization {
  id: string
  name: string
  slug: string
  logo?: string | null
}

const route = useRoute()
const { data: sessionData, refreshSession } = useAuth()
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
const canManageSite = computed(() => dashboard.siteAccess.value === 'organization' || dashboard.siteAccess.value === 'site')
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
const currentLocationSlug = dashboardLocation.routeLocationSlug
const routeName = computed(() => typeof route.name === 'string' ? route.name : '')
const isAccountRoute = computed(() => routeName.value.startsWith('dashboard-account'))
const isAdminRoute = computed(() => routeName.value.startsWith('admin'))
const isConversationsRoute = computed(() => routeName.value.includes('conversations'))
const showChowBot = computed(() => !isConversationsRoute.value
  && (dashboard.siteAccess.value !== 'location' || scope.value === 'location'))

const organizationLabel = computed(() => organization.value?.name ?? 'Organization')

const siteLabel = computed(() => site.value?.brand_name ?? site.value?.subdomain ?? 'No site')
const siteAvatar = (candidate: (typeof sites.value)[number] | undefined) => {
  const media = candidate?.media.find(item => item.slot === 'media')
  return media?.thumbnail_url || media?.public_url || undefined
}
const locationAvatar = (candidate: (typeof dashboard.locations.value)[number] | null | undefined) => {
  const media = candidate?.media.find(item => item.slot === 'hero')
  return media?.thumbnail_url || media?.public_url || undefined
}
const scope = computed<'organization' | 'site' | 'location'>(() => {
  if (currentLocationSlug.value) return 'location'
  if (activeSiteSlug.value) return 'site'
  return 'organization'
})

const scopeHeaderModel = computed<DashboardScopeHeaderModel>(() => {
  if (scope.value === 'location') {
    const currentLocation = dashboardLocation.currentLocation.value
    const currentLocationAvatar = locationAvatar(currentLocation)
    return {
      scope: 'location',
      current: {
        label: currentLocation?.title ?? currentLocationSlug.value ?? 'Location',
        avatar: currentLocationAvatar,
        icon: currentLocationAvatar ? undefined : 'i-lucide-map-pin',
      },
      parent: siteBase.value ? { label: siteLabel.value, to: siteBase.value } : null,
      peers: dashboard.locations.value.map(location => ({
        label: location.title,
        avatar: locationAvatar(location),
        icon: locationAvatar(location) ? undefined : 'i-lucide-map-pin',
        active: location.slug === currentLocationSlug.value,
        to: dashboardLocation.buildLocationWorkspacePath(location.slug),
      })),
      createAction: canManageSite.value && siteBase.value
        ? { label: 'New Location', to: `${siteBase.value}/locations/new` }
        : undefined,
    }
  }

  if (scope.value === 'site') {
    const currentSite = sites.value.find(candidate => candidate.id === site.value?.id)
    const currentSiteAvatar = siteAvatar(currentSite)
    return {
      scope: 'site',
      current: {
        label: siteLabel.value,
        avatar: currentSiteAvatar,
        icon: currentSiteAvatar ? undefined : 'i-lucide-globe'
      },
      parent: orgBase.value ? { label: organizationLabel.value, to: orgBase.value } : null,
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

const primaryNavigationContext = computed<DashboardPrimaryNavigationContext>(() => {
  const organizationSlug = (organization.value ?? accountOrganization.value)?.slug
  if (!organizationSlug) return { kind: 'unavailable' }

  const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
  const locationSlug = typeof route.params.locationSlug === 'string' ? route.params.locationSlug : null
  if (siteSlug && locationSlug) {
    return { kind: 'location', organizationSlug, siteSlug, locationSlug }
  }
  if (siteSlug) return { kind: 'site', organizationSlug, siteSlug }
  return { kind: 'organization', organizationSlug }
})

const primaryNavigation = computed(() => resolveDashboardPrimaryNavigation({
  context: primaryNavigationContext.value,
  currentPath: route.path,
}))
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
