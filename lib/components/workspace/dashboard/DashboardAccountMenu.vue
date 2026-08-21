<template>
  <UDropdownMenu
    :items="items"
    :content="menuContent"
    :modal="false"
    :ui="menuUi"
  >
    <UButton
      v-if="!mobileOnly"
      color="neutral"
      variant="ghost"
      class="dashboard-account-menu-button w-full min-w-0 cursor-pointer hover:text-highlighted"
      :class="collapsed ? 'justify-center' : 'justify-between'"
      :ui="{ base: 'min-w-0 w-full items-center px-2 py-1.5', trailingIcon: 'text-dimmed ms-auto' }"
      :avatar="{ src: renderedUser?.image ?? undefined, alt: displayName, size: 'sm' }"
      :label="collapsed ? undefined : displayName"
      :trailing-icon="collapsed ? undefined : 'i-lucide-ellipsis'"
      data-testid="dashboard-account-menu-button"
    />
    <UButton
      v-else
      color="neutral"
      variant="ghost"
      square
      :avatar="{ src: renderedUser?.image ?? undefined, alt: displayName, size: 'sm' }"
      aria-label="Open account menu"
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

const props = defineProps<{ collapsed?: boolean, mobileOnly?: boolean }>()

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
  align: props.mobileOnly ? 'end' as const : 'start' as const,
  collisionPadding: 12,
  side: 'top' as const,
  sideOffset: 12,
}))
const menuUi = computed(() => ({
  content: props.mobileOnly
    ? 'max-h-[calc(100dvh-5rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl p-2 shadow-2xl'
    : 'w-64 rounded-2xl p-1.5 shadow-xl',
  item: 'min-h-10 rounded-xl px-2.5 py-2 text-sm',
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

const credits = ref<OrganizationCreditsResource | null>(null)

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

if (import.meta.client) {
  watch(() => dashboard.organization.value?.slug, async (orgSlug) => {
    credits.value = null
    if (!orgSlug) return
    try {
      credits.value = await dashboardFetch<OrganizationCreditsResource>('/api/billing/credits', { orgSlug }, {
        method: 'GET',
        validate: isOrganizationCreditsResource,
      })
    } catch {
      credits.value = null
    }
  }, { immediate: true })
}

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

const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: displayName.value,
      avatar: { src: renderedUser.value?.image ?? undefined, alt: displayName.value },
      to: settingsTo.value,
    },
  ],
  [
    ...(usageLabel.value ? [{ label: 'Usage', icon: 'i-lucide-gauge', disabled: true, slot: 'usage' }] : []),
    ...(organizationSettingsTo.value ? [{ label: 'Settings', icon: 'i-lucide-settings', to: organizationSettingsTo.value }] : []),
    { label: 'Help', icon: 'i-lucide-circle-help', to: config.public.helpUrl as string, target: '_blank' },
    { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
    { label: 'Log Out', icon: 'i-lucide-log-out', onSelect: handleSignOut },
  ],
])
</script>

<style scoped>
.dashboard-account-menu-button:hover,
.dashboard-account-menu-button:focus-visible {
  background-color: var(--ui-bg-accented) !important;
}

</style>
