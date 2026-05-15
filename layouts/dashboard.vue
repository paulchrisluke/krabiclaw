<template>
  <div class="platform-theme">
    <div v-if="impersonatedBy" class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div class="pointer-events-auto flex items-center gap-3 rounded-full border border-warning/40 bg-default px-5 py-2.5 shadow-xl">
        <span class="relative flex size-2 shrink-0">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
          <span class="relative inline-flex size-2 rounded-full bg-warning" />
        </span>
        <span class="text-sm font-medium text-highlighted">
          Impersonating <span class="font-semibold">{{ sessionData?.user?.email }}</span>
        </span>
        <UButton size="xs" color="warning" variant="soft" :loading="stoppingImpersonation" @click="stopImpersonating">
          Exit
        </UButton>
      </div>
    </div>
    <UDashboardGroup
      unit="rem"
      :min-size="14"
      :default-size="18"
      :max-size="24"
      storage="local"
      storage-key="dashboard-sidebar"
    >
      <UDashboardSidebar resizable collapsible>
        <template #header="{ collapsed }">
          <!-- Admin level -->
          <template v-if="inAdminWorkspace">
            <div v-if="collapsed" class="flex items-center justify-center">
              <div class="flex size-8 items-center justify-center rounded-lg bg-error">
                <span class="text-sm font-bold text-white">A</span>
              </div>
            </div>
            <div v-else class="px-2">
              <span class="font-semibold text-sm">Platform Admin</span>
            </div>
          </template>

          <!-- Org level -->
          <template v-else-if="!inSiteWorkspace">
            <div v-if="collapsed" class="flex items-center justify-center">
              <div class="flex size-8 items-center justify-center rounded-lg bg-primary">
                <span class="text-sm font-bold text-white">K</span>
              </div>
            </div>
            <div v-else class="space-y-1">
              <UDropdownMenu
                :items="siteMenuItems"
                :content="{ align: 'start', collisionPadding: 12 }"
                :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-52' }"
              >
                <UButton
                  v-bind="selectedSiteButton"
                  trailing-icon="i-lucide-chevrons-up-down"
                  color="neutral"
                  variant="ghost"
                  square
                  class="w-full data-[state=open]:bg-elevated overflow-hidden"
                  :ui="{ trailingIcon: 'text-dimmed ms-auto' }"
                />
              </UDropdownMenu>
            </div>
          </template>
          
          <!-- Site level — show site name with back button -->
          <template v-else-if="inSiteWorkspace">
            <div v-if="collapsed" class="flex items-center justify-center">
              <div class="flex size-8 items-center justify-center rounded-lg bg-primary">
                <span class="text-sm font-bold text-white">K</span>
              </div>
            </div>
            <div v-else class="flex items-center gap-2 px-2 min-w-0 overflow-hidden">
              <UButton
                to="/dashboard/sites"
                icon="i-heroicons-arrow-left"
                variant="ghost"
                color="neutral"
                size="xs"
                class="shrink-0"
              />
              <span class="font-semibold text-sm truncate min-w-0">{{ siteContext?.brand_name }}</span>
            </div>
          </template>
        </template>

        <template #default="{ collapsed }">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="navigationItems"
            orientation="vertical"
          />

          <ClientOnly>
            <template v-if="inSiteWorkspace && !collapsed">
              <div class="mt-2 border-t border-default pt-2 px-2">
                <div class="flex items-center justify-between px-1 py-1 mb-1">
                  <span class="text-xs font-medium text-muted">ChowBot</span>
                  <UTooltip text="New conversation">
                    <UButton
                      icon="i-heroicons-plus"
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      @click="newChowBotChat"
                    />
                  </UTooltip>
                </div>
                <UButton
                  v-for="conv in siteConversations"
                  :key="conv.id"
                  :label="conv.title"
                  icon="i-lucide-message-square"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  class="w-full justify-start mb-0.5"
                  :ui="{ label: 'truncate text-left' }"
                  @click="loadChowBotChat(conv)"
                />
                <p v-if="!siteConversations.length" class="px-1 text-xs text-muted italic">
                  No conversations yet
                </p>
              </div>
            </template>
          </ClientOnly>
        </template>

        <template #footer="{ collapsed }">
          <UDropdownMenu :items="profileMenuItems" :content="{ align: 'start', collisionPadding: 12, side: 'top' }">
            <UButton
              :avatar="{
                src: sessionData?.user?.image ?? undefined,
                loading: 'lazy',
                alt: sessionData?.user?.name || 'User avatar'
              }"
              color="neutral"
              variant="ghost"
              class="w-full"
              :block="collapsed"
            >
              <template v-if="!collapsed" #default>
                <span class="truncate flex-1 text-left">{{ sessionData?.user?.name }}</span>
                <UBadge
                  v-if="currentPlan"
                  :label="currentPlan"
                  :color="currentPlan === 'free' ? 'neutral' : 'success'"
                  variant="soft"
                  size="xs"
                  class="capitalize shrink-0"
                />
              </template>
            </UButton>
          </UDropdownMenu>
        </template>
      </UDashboardSidebar>

      <UDashboardPanel>
        <template #header>
          <UDashboardNavbar :title="navbarTitle">
            <template #right>
              <UButton
                v-if="inSiteWorkspace && siteContext"
                :to="sitePath('/settings')"
                icon="i-heroicons-cog-6-tooth"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Scope settings"
              />
              <UColorModeButton variant="ghost" color="neutral" size="sm" />
              <UTooltip v-if="!inAdminWorkspace" text="ChowBot">
                <UButton
                  icon="i-lucide-bot"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="Open ChowBot"
                  @click="toggleChowbot"
                />
              </UTooltip>
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <slot />
        </template>
      </UDashboardPanel>

      <ChowBot />
    </UDashboardGroup>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'
import { useChowBot } from '~/composables/useChowBot'
import type { ChowBotConv } from '~/composables/useChowBotHistory'
import { useChowBotHistory } from '~/composables/useChowBotHistory'

interface DashboardSite {
  id: string
  brand_name: string
  subdomain: string
  status: string
}

const route = useRoute()
const router = useRouter()
const { data: sessionData, signOut } = useAuth()
const toast = useToast()
const stoppingImpersonation = ref(false)
const chowBot = useChowBot()
const toggleChowbot = () => chowBot.toggle()
const chowBotHistory = useChowBotHistory()
const siteRefreshSignal = useState<number>('site:refresh', () => 0)

watch(siteRefreshSignal, () => loadSiteContext())

const siteConversations = computed(() =>
  routeSiteId.value ? chowBotHistory.forSite(routeSiteId.value) : []
)

const newChowBotChat = () => chowBot.startNewConversation()
const loadChowBotChat = (conv: ChowBotConv) => chowBot.loadConversation(conv)

const siteContext = ref<DashboardSite | null>(null)
const sites = ref<DashboardSite[]>([])
const selectedSiteId = ref<string | null>(null)

const { data: billingStatus } = useFetch<{ billing: { plan: string } }>('/api/billing/status', { key: 'dashboard-billing-status' })
const currentPlan = computed(() => billingStatus.value?.billing?.plan ?? null)
const impersonatedBy = computed(() => {
  const session = sessionData.value?.session as { impersonatedBy?: string } | undefined
  return session?.impersonatedBy
})

const routeSiteId = computed(() => {
  const param = route.params.siteId || route.params.id
  return typeof param === 'string' && route.path.startsWith('/dashboard/sites/') ? param : null
})

watch(routeSiteId, (siteId) => {
  if (!import.meta.client) return
  if (siteId) chowBotHistory.load(siteId).catch(console.error)
}, { immediate: true })

const inSiteWorkspace = computed(() => Boolean(routeSiteId.value))
const inAdminWorkspace = computed(() => route.path.startsWith('/admin'))
const activeSiteId = computed(() => routeSiteId.value || selectedSiteId.value)

const selectedSiteLabel = computed(() =>
  siteContext.value?.brand_name
    ?? sites.value.find((site: DashboardSite) => site.id === selectedSiteId.value)?.brand_name
    ?? 'Choose a website'
)

const sitePath = (path = '', query?: Record<string, string>) => {
  if (!activeSiteId.value) {
    throw new Error('sitePath requires an active site ID')
  }
  return {
    path: `/dashboard/sites/${activeSiteId.value}${path}`,
    query
  }
}

const navbarTitle = computed(() => {
  if (inAdminWorkspace.value) return 'Platform Admin'
  if (!inSiteWorkspace.value || !siteContext.value) return 'Dashboard'
  return siteContext.value.brand_name
})

const platformNavigation = computed(() => [[
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/dashboard' },
  { label: 'Sites', icon: 'i-heroicons-globe-alt', to: '/dashboard/sites' },
  { label: 'Billing', icon: 'i-heroicons-credit-card', to: '/dashboard/billing' },
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: '/dashboard/settings' }
]])

const adminNavigation = computed(() => [[
  { label: 'Analytics', icon: 'i-heroicons-chart-bar', to: '/admin' },
  { label: 'Blog', icon: 'i-heroicons-newspaper', to: '/admin?tab=blog' },
  { label: 'Content', icon: 'i-heroicons-document-text', to: '/admin?tab=content' },
  { label: 'Domains', icon: 'i-heroicons-globe-alt', to: '/admin?tab=domains' },
  { label: 'Users', icon: 'i-heroicons-users', to: '/admin?tab=users' },
], [
  { label: 'Back to Dashboard', icon: 'i-heroicons-arrow-left', to: '/dashboard' },
]])

const selectedSiteButton = computed(() => ({
  label: selectedSiteLabel.value,
  icon: 'i-heroicons-globe-alt'
}))

const siteMenuItems = computed(() => [
  sites.value.map((site: DashboardSite) => ({
    label: site.brand_name,
    icon: site.id === activeSiteId.value ? 'i-heroicons-check' : 'i-heroicons-globe-alt',
    onSelect: () => handleSiteChange(site.id)
  })),
  [
    {
      label: 'All websites',
      icon: 'i-heroicons-squares-2x2',
      onSelect: () => router.push('/dashboard/sites')
    },
    {
      label: 'Create website',
      icon: 'i-heroicons-plus',
      onSelect: () => router.push('/dashboard/onboarding')
    }
  ]
])

const profileMenuItems = computed(() => [
  [
    {
      label: sessionData.value?.user?.email || 'User',
      icon: 'i-heroicons-envelope',
      disabled: true,
      type: 'label' as const
    }
  ],
  [
    {
      label: 'Account Settings',
      icon: 'i-heroicons-cog-6-tooth',
      to: '/dashboard/settings'
    }
  ],
  [
    {
      label: 'Log out',
      icon: 'i-lucide-log-out',
      color: 'error' as const,
      onSelect: handleSignOut
    }
  ]
])

const siteNavigation = computed(() => [[
  { label: 'Overview', icon: 'i-heroicons-home', to: sitePath() },
  { label: 'Content', icon: 'i-heroicons-document-text', to: sitePath('/content') },
  { label: 'Menu', icon: 'i-heroicons-list-bullet', to: sitePath('/menu') },
  { label: 'Posts', icon: 'i-heroicons-newspaper', to: sitePath('/posts') },
  { label: 'Media', icon: 'i-heroicons-photo', to: sitePath('/media') },
  { label: 'Locations', icon: 'i-heroicons-map-pin', to: sitePath('/locations') },
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: sitePath('/settings') }
], [
  { label: 'All Sites', icon: 'i-heroicons-squares-2x2', to: '/dashboard/sites' },
  { label: 'Billing', icon: 'i-heroicons-credit-card', to: '/dashboard/billing' }
]])

const navigationItems = computed(() => {
  if (inAdminWorkspace.value) return adminNavigation.value
  if (!activeSiteId.value || !routeSiteId.value) return platformNavigation.value
  return siteNavigation.value
})

const loadSites = async () => {
  try {
    const response = await $fetch<{ sites: DashboardSite[] }>('/api/sites')
    sites.value = response.sites || []

    if (routeSiteId.value) {
      selectedSiteId.value = routeSiteId.value
    } else if (!selectedSiteId.value && sites.value.length > 0) {
      selectedSiteId.value = sites.value[0]!.id
    }
  } catch (err) {
    console.error('Failed to load sites:', err)
    sites.value = []
  }
}

const loadSiteContext = async () => {
  if (!routeSiteId.value || !sessionData.value?.user?.id) {
    siteContext.value = null
    return
  }

  try {
    const settingsResponse = await $fetch<{ success: boolean; settings: DashboardSite }>(`/api/sites/${routeSiteId.value}/settings`)
    if (settingsResponse.success) siteContext.value = settingsResponse.settings
  } catch (err) {
    const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err ? err.statusCode : undefined
    if (statusCode !== 401) console.error('Failed to load site context:', err)
    siteContext.value = null
  }
}

const handleSiteChange = async (siteId: string) => {
  selectedSiteId.value = siteId
  await router.push(`/dashboard/sites/${siteId}`)
}

watch(
  () => [routeSiteId.value, selectedSiteId.value],
  async () => {
    if (routeSiteId.value) selectedSiteId.value = routeSiteId.value
    await loadSiteContext()
  },
  { immediate: true }
)

onMounted(async () => {
  await loadSites()
})

async function handleSignOut() {
  await signOut()
  await navigateTo('/login')
}

async function stopImpersonating() {
  stoppingImpersonation.value = true
  try {
    await $fetch('/api/admin/impersonation/stop', { method: 'POST' })
    await navigateTo('/admin?tab=users')
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
