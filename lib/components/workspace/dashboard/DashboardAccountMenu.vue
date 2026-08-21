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
      :avatar="{ src: renderedUser?.image ?? undefined, alt: renderedUser?.name || 'User avatar', size: 'sm' }"
      :label="collapsed ? undefined : renderedUser?.name"
      :trailing-icon="collapsed ? undefined : 'i-lucide-ellipsis'"
      data-testid="dashboard-account-menu-button"
    />
    <UButton
      v-else
      color="neutral"
      variant="ghost"
      square
      :avatar="{ src: renderedUser?.image ?? undefined, alt: renderedUser?.name || 'User avatar', size: 'sm' }"
      aria-label="Open account menu"
      data-testid="dashboard-mobile-account-menu-button"
    />
  </UDropdownMenu>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { dashboardAccountRouteQueryKey } from './dashboardScopeHeaderContext'

const props = defineProps<{ collapsed?: boolean, mobileOnly?: boolean }>()

const { sessionData } = await useAuthSession()
const { signOut } = useAuth()
const route = useRoute()
const dashboard = useDashboardSite()
const { preference, setPreference } = usePlatformTheme()
const config = useRuntimeConfig()
const renderedUser = computed(() => sessionData.value?.user ?? null)
const accountRouteQuery = inject(dashboardAccountRouteQueryKey, computed((): Record<string, string> => {
  const organization = dashboard.organization.value
  if (!organization?.slug) return {}
  return { organization: organization.slug, organizationName: organization.name }
}))

const settingsTo = computed(() => ({
  path: '/dashboard/account',
  query: accountRouteQuery.value,
}))

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

function getThemeIcon(pref: 'system' | 'light' | 'dark') {
  if (pref === 'system') return 'i-lucide-monitor'
  if (pref === 'light') return 'i-lucide-sun'
  return 'i-lucide-moon'
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
      label: renderedUser.value?.name || 'User',
      description: renderedUser.value?.email || undefined,
      avatar: { src: renderedUser.value?.image ?? undefined, alt: renderedUser.value?.name || 'User avatar' },
      to: settingsTo.value,
    },
  ],
  [
    { type: 'label', label: 'Theme' },
    ...(['system', 'light', 'dark'] as const).map(pref => ({
      label: `${pref.charAt(0).toUpperCase()}${pref.slice(1)}`,
      icon: getThemeIcon(pref),
      trailingIcon: preference.value === pref ? 'i-lucide-check' : undefined,
      onSelect: () => setPreference(pref),
    })),
  ],
  [
    { label: 'Help', icon: 'i-lucide-circle-help', to: config.public.helpUrl as string, target: '_blank' },
    { label: 'Docs', icon: 'i-lucide-book-open', to: '/docs' },
  ],
  [{ label: 'Log Out', icon: 'i-lucide-log-out', color: 'error', onSelect: handleSignOut }],
])
</script>

<style scoped>
.dashboard-account-menu-button:hover,
.dashboard-account-menu-button:focus-visible {
  background-color: var(--ui-bg-accented) !important;
}

</style>
