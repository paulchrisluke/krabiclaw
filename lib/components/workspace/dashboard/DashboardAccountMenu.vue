<template>
  <UDropdownMenu
    v-if="!mobileOnly"
    :items="items"
    :content="{ align: 'start', collisionPadding: 12, side: 'top', sideOffset: 12 }"
    :ui="{ content: 'w-[260px]' }"
  >
    <UButton
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

    <template #content-top>
      <div class="flex flex-col px-2.5 py-2">
        <span class="text-sm font-semibold text-highlighted truncate">{{ renderedUser?.name || 'User' }}</span>
        <span class="text-xs text-muted truncate mt-0.5">{{ renderedUser?.email }}</span>
      </div>
    </template>

    <template #theme>
      <div class="flex w-full items-center justify-between px-2.5 py-1.5 text-sm font-medium text-default">
        <span>Theme</span>
        <div class="bg-muted border border-default p-0.5 rounded-full flex items-center gap-0.5 shadow-inner">
          <button
            v-for="pref in ['system', 'light', 'dark'] as const"
            :key="pref"
            class="rounded-full size-7 flex items-center justify-center transition-all cursor-pointer"
            :class="preference === pref ? 'bg-elevated text-highlighted shadow-sm border border-default' : 'text-dimmed hover:text-muted'"
            :aria-label="`${pref} theme`"
            :aria-pressed="preference === pref"
            @click="setPreference(pref)"
          >
            <UIcon :name="getThemeIcon(pref)" class="size-3.5" />
          </button>
        </div>
      </div>
    </template>

    <template #content-bottom>
      <div class="px-2.5 py-2.5 flex items-center justify-between select-none border-t border-default">
        <div class="flex flex-col">
          <span class="text-[10px] text-dimmed uppercase tracking-wider font-semibold">Platform Status</span>
          <span class="text-xs font-semibold text-highlighted mt-0.5">
            {{ platformStatus === 'normal' ? 'All systems normal.' : platformStatus === 'loading' ? 'Checking status...' : 'System interruption' }}
          </span>
        </div>
        <span class="relative flex size-2">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            :class="{
              'bg-success': platformStatus === 'normal',
              'bg-warning': platformStatus === 'loading',
              'bg-error': platformStatus === 'error'
            }"
          />
          <span
            class="relative inline-flex size-2 rounded-full"
            :class="{
              'bg-success': platformStatus === 'normal',
              'bg-warning': platformStatus === 'loading',
              'bg-error': platformStatus === 'error'
            }"
          />
        </span>
      </div>
    </template>
  </UDropdownMenu>

  <template v-else>
    <UButton
      color="neutral"
      variant="ghost"
      square
      :avatar="{ src: renderedUser?.image ?? undefined, alt: renderedUser?.name || 'User avatar', size: 'sm' }"
      aria-label="Open account menu"
      @click="mobileOpen = true"
    />
    <UModal
      v-model:open="mobileOpen"
      title="Account menu"
      :close="false"
      :ui="{ overlay: 'md:hidden', content: 'fixed inset-x-0 bottom-0 top-auto max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-default bg-elevated p-4 shadow-2xl sm:max-w-none md:hidden' }"
    >
      <template #content>
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-accented" />
        <div class="mb-3 px-3"><p class="font-semibold text-highlighted">{{ renderedUser?.name || 'User' }}</p><p class="truncate text-sm text-muted">{{ renderedUser?.email }}</p></div>
        <nav class="divide-y divide-default border-y border-default">
          <NuxtLink :to="profileTo" class="mobile-account-row" @click="mobileOpen = false"><UIcon name="i-lucide-user" class="size-5" /><span>Profile</span><UIcon name="i-lucide-chevron-right" class="ml-auto size-4 text-dimmed" /></NuxtLink>
          <div class="mobile-account-row"><span>Theme</span><div class="ml-auto flex gap-1"><UButton v-for="pref in ['system', 'light', 'dark'] as const" :key="pref" :icon="getThemeIcon(pref)" square size="xs" color="neutral" :variant="preference === pref ? 'soft' : 'ghost'" :aria-label="`${pref} theme`" @click="setPreference(pref)" /></div></div>
          <a :href="config.public.helpUrl as string" target="_blank" class="mobile-account-row"><UIcon name="i-lucide-circle-help" class="size-5" /><span>Help</span></a>
          <NuxtLink to="/docs" class="mobile-account-row" @click="mobileOpen = false"><UIcon name="i-lucide-book-open" class="size-5" /><span>Docs</span></NuxtLink>
          <button type="button" class="mobile-account-row w-full text-error" @click="handleSignOut"><UIcon name="i-lucide-log-out" class="size-5" /><span>Log Out</span></button>
        </nav>
        <div class="flex items-center justify-between px-3 pt-4 text-sm"><span class="text-muted">Platform Status</span><span class="font-medium text-highlighted">{{ platformStatus === 'normal' ? 'All systems normal.' : platformStatus === 'loading' ? 'Checking status...' : 'System interruption' }}</span></div>
      </template>
    </UModal>
  </template>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { dashboardAccountRouteQueryKey } from './dashboardScopeHeaderContext'

defineProps<{ collapsed?: boolean, mobileOnly?: boolean }>()

const { sessionData } = await useAuthSession()
const { signOut } = useAuth()
const route = useRoute()
const dashboard = useDashboardSite()
const { preference, setPreference } = usePlatformTheme()
const config = useRuntimeConfig()
const mobileOpen = ref(false)
const renderedUser = computed(() => sessionData.value?.user ?? null)
const accountRouteQuery = inject(dashboardAccountRouteQueryKey, computed((): Record<string, string> => {
  const organization = dashboard.organization.value
  if (!organization?.slug) return {}
  return { organization: organization.slug, organizationName: organization.name }
}))

const profileTo = computed(() => ({
  path: '/dashboard/account/profile',
  query: accountRouteQuery.value,
}))

function getThemeIcon(pref: 'system' | 'light' | 'dark') {
  if (pref === 'system') return 'i-lucide-monitor'
  if (pref === 'light') return 'i-lucide-sun'
  return 'i-lucide-moon'
}

const platformStatus = ref<'normal' | 'loading' | 'error'>('loading')

async function checkPlatformStatus() {
  try {
    // Use $fetch for platform health check (not dashboard-scoped API traffic)
    const res = await $fetch<{ status: string }, string>('/api/health')
    platformStatus.value = res.status === 'ok' ? 'normal' : 'error'
  } catch (err) {
    console.error('Failed to fetch platform status:', err)
    platformStatus.value = 'error'
  }
}

onMounted(() => {
  checkPlatformStatus().catch(console.error)
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

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Profile', icon: 'i-lucide-user', to: profileTo.value }],
  [{ slot: 'theme', onSelect: (e: Event) => e.preventDefault() }],
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

.mobile-account-row {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 0.75rem;
  padding-inline: 0.75rem;
  color: var(--ui-text);
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
