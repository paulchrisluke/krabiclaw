<template>
  <UDropdownMenu
    :items="items"
    :content="menuContent"
    :modal="false"
    :ui="menuUi"
  >
    <UButton
      v-if="placement === 'desktop-top'"
      color="neutral"
      variant="ghost"
      class="dashboard-account-menu-button min-h-11 min-w-0 max-w-56 cursor-pointer hover:text-highlighted"
      :ui="{ base: 'min-w-0 items-center px-3', label: 'truncate', trailingIcon: 'text-dimmed ms-auto' }"
      :avatar="{ src: renderedUser?.image ?? undefined, alt: displayName, size: 'sm' }"
      :label="displayName"
      trailing-icon="i-lucide-chevron-down"
      data-testid="dashboard-account-menu-button"
    />
    <UButton
      v-else
      color="neutral"
      variant="ghost"
      icon="i-lucide-menu"
      label="Menu"
      class="min-h-14 min-w-11 w-full flex-col gap-0.5 rounded-none px-2 py-1 text-xs"
      :ui="{ leadingIcon: 'size-5', label: 'font-medium' }"
      aria-label="Open dashboard menu"
      data-testid="dashboard-mobile-account-menu-button"
    />

    <template #usage-trailing>
      <span class="text-xs tabular-nums text-dimmed">{{ usageLabel }}</span>
    </template>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { dashboardAccountRouteQueryKey } from './dashboardScopeHeaderContext'
import { dashboardFetch } from '~/composables/dashboardFetch'

type DashboardAccountMenuPlacement = 'desktop-top' | 'mobile-bottom'

const props = defineProps<{ placement: DashboardAccountMenuPlacement }>()

const { sessionData } = await useAuthSession()
const { signOut } = useAuth()
const route = useRoute()
const dashboard = useDashboardSite()
const config = useRuntimeConfig()
const renderedUser = computed(() => sessionData.value?.user ?? null)
const displayName = computed(() => renderedUser.value?.name || renderedUser.value?.email || 'User')
const accountRouteQuery = inject(dashboardAccountRouteQueryKey, computed((): Record<string, string> => {
  const organization = dashboard.organization.value
  if (!organization?.slug) return {}
  return { organization: organization.slug, organizationName: organization.name }
}))

const settingsTo = computed(() => ({
  path: '/dashboard/account',
  query: accountRouteQuery.value,
}))
const organizationSettingsTo = computed(() => {
  const organization = dashboard.organization.value
  if (!organization?.slug || !['owner', 'admin'].includes(organization.role ?? '')) return null
  return `/dashboard/${organization.slug}/settings`
})

const menuContent = computed(() => ({
  align: 'end' as const,
  collisionPadding: 12,
  side: props.placement === 'mobile-bottom' ? 'top' as const : 'bottom' as const,
  sideOffset: 12,
}))
const menuUi = computed(() => ({
  content: props.placement === 'mobile-bottom'
    ? 'max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl p-2 shadow-2xl'
    : 'w-64 rounded-2xl p-1.5 shadow-xl',
  item: 'min-h-11 rounded-xl px-2.5 py-2 text-sm',
  separator: 'my-1',
}))

interface OrganizationCreditsResource {
  periodAllowance: number | null
  periodUsed: number
  periodRemaining: number | null
  unlimited: boolean
  reconciliationRequired: boolean
}

const isOrganizationCreditsResource = (value: unknown): value is OrganizationCreditsResource =>
  isRecord(value)
  && (value.periodAllowance === null || typeof value.periodAllowance === 'number')
  && typeof value.periodUsed === 'number'
  && (value.periodRemaining === null || typeof value.periodRemaining === 'number')
  && typeof value.unlimited === 'boolean'
  && typeof value.reconciliationRequired === 'boolean'

const credits = useState<OrganizationCreditsResource | null>('dashboard-account-credits', () => null)
const creditsOrganizationId = useState<string | null>('dashboard-account-credits-organization-id', () => null)

if (import.meta.server) {
  const requestEvent = useRequestEvent()
  const organization = dashboard.organization.value
  if (requestEvent && organization?.id) {
    const [{ cloudflareEnv }, { getOrganizationCreditsResource }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/ai-credits'),
    ])
    const db = cloudflareEnv(requestEvent).DB
    if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
    credits.value = await getOrganizationCreditsResource(db, organization.id)
    creditsOrganizationId.value = organization.id
  }
}

const usageLabel = computed(() => {
  const resource = credits.value
  if (!resource || resource.reconciliationRequired) return null
  if (resource.unlimited) return 'Unlimited'
  if (resource.periodAllowance === null || resource.periodAllowance <= 0 || resource.periodRemaining === null) return null
  const percentLeft = Math.round((resource.periodRemaining / resource.periodAllowance) * 100)
  return `${percentLeft}% left`
})

const creditsRequestId = useState('dashboard-account-credits-request-id', () => 0)

if (import.meta.client) {
  watch(() => dashboard.organization.value?.id, async (organizationId) => {
    const requestId = ++creditsRequestId.value
    const orgSlug = dashboard.organization.value?.slug
    if (!organizationId || !orgSlug) {
      credits.value = null
      creditsOrganizationId.value = null
      return
    }
    if (creditsOrganizationId.value === organizationId) return
    credits.value = null
    creditsOrganizationId.value = null
    try {
      const resource = await dashboardFetch<OrganizationCreditsResource>('/api/billing/credits', { orgSlug }, {
        method: 'GET',
        validate: isOrganizationCreditsResource,
      })
      if (requestId === creditsRequestId.value) {
        credits.value = resource
        creditsOrganizationId.value = organizationId
      }
    } catch {
      if (requestId === creditsRequestId.value) credits.value = null
    }
  }, { immediate: true })
}

async function handleSignOut() {
  const redirect = route.fullPath
  await signOut()
  await navigateTo({ path: '/login', query: { redirect } })
}

const accountItems = computed<DropdownMenuItem[]>(() => [
  { label: 'Profile', icon: 'i-lucide-user', to: { path: '/dashboard/account/profile', query: accountRouteQuery.value } },
  { label: 'Authentication', icon: 'i-lucide-shield', to: { path: '/dashboard/account/authentication', query: accountRouteQuery.value } },
])

const siteItems = computed<DropdownMenuItem[]>(() => {
  const organizationSlug = dashboard.organization.value?.slug
  const siteSlug = route.params.siteSlug
  if (!organizationSlug || typeof siteSlug !== 'string' || dashboard.siteAccess.value === 'location') return []

  const siteBase = `/dashboard/${encodeURIComponent(organizationSlug)}/sites/${encodeURIComponent(siteSlug)}`
  return [
    { label: 'Assistant', icon: 'i-lucide-bot', to: `${siteBase}/conversations` },
    { label: 'Analytics', icon: 'i-lucide-chart-bar', to: `${siteBase}/analytics` },
    { label: 'Domains', icon: 'i-lucide-globe', to: `${siteBase}/domains` },
    { label: 'Site settings', icon: 'i-lucide-settings', to: `${siteBase}/settings` },
  ]
})

const adminItems = computed<DropdownMenuItem[]>(() => [
  ...(dashboard.managedServiceEnabled.value ? [{ label: 'Work Queue', icon: 'i-lucide-list-todo', to: '/admin/work' }] : []),
  { label: 'Clients', icon: 'i-lucide-building-2', to: '/admin/clients' },
  { label: 'Members', icon: 'i-lucide-user-plus', to: '/admin/members' },
  { label: 'Analytics', icon: 'i-lucide-chart-bar', to: '/admin/analytics' },
  { label: 'Domains', icon: 'i-lucide-globe', to: '/admin/domains' },
  { label: 'Users', icon: 'i-lucide-users', to: '/admin/users' },
  { label: 'Content', icon: 'i-lucide-file-text', to: '/admin/content' },
  { label: 'Localization', icon: 'i-lucide-languages', to: '/admin/localization' },
  { label: 'Blog', icon: 'i-lucide-pencil', to: '/admin/blog' },
  { label: 'Docs', icon: 'i-lucide-book-open', to: '/admin/docs' },
])

const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [
    [
    {
      label: displayName.value,
      description: renderedUser.value?.email ?? undefined,
      avatar: { src: renderedUser.value?.image ?? undefined, alt: displayName.value },
      to: settingsTo.value,
    },
    ],
    accountItems.value,
  ]
  if (siteItems.value.length) groups.push(siteItems.value)
  if (route.name?.toString().startsWith('admin')) groups.push(adminItems.value)
  groups.push([
    ...(usageLabel.value ? [{ label: 'Usage', icon: 'i-lucide-gauge', disabled: true, slot: 'usage' }] : []),
    ...(organizationSettingsTo.value ? [{ label: 'Organization settings', icon: 'i-lucide-settings', to: organizationSettingsTo.value }] : []),
    { label: 'Help', icon: 'i-lucide-circle-help', to: config.public.helpUrl as string, target: '_blank' },
    { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
    { label: 'Log Out', icon: 'i-lucide-log-out', onSelect: handleSignOut },
  ])
  return groups
})
</script>

<style scoped>
.dashboard-account-menu-button:hover,
.dashboard-account-menu-button:focus-visible {
  background-color: var(--ui-bg-accented) !important;
}

</style>
