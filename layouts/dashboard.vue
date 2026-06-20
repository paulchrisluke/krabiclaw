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

    <UDashboardGroup unit="rem" :min-size="14" :default-size="18" :max-size="24">
      <UDashboardSidebar resizable collapsible>
        <template #header="{ collapsed }">
          <template v-if="inLocationWorkspace">
            <div v-if="collapsed" class="flex items-center justify-center w-full">
              <UButton
                :to="orgBase ?? '/dashboard'"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Back to Restaurant"
              />
            </div>
            <NuxtLink
              v-else
              :to="orgBase ?? '/dashboard'"
              class="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-highlighted hover:bg-muted rounded-lg transition-colors w-full"
            >
              <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
              <span class="truncate">{{ currentLocation?.title ?? 'Location' }}</span>
            </NuxtLink>
          </template>

          <template v-else-if="inSettingsWorkspace">
            <div v-if="collapsed" class="flex items-center justify-center w-full">
              <UButton
                :to="orgBase ?? '/dashboard'"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Back to Dashboard"
              />
            </div>
            <NuxtLink
              v-else
              :to="orgBase ?? '/dashboard'"
              class="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-highlighted hover:bg-muted rounded-lg transition-colors w-full"
            >
              <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
              <span class="truncate">Back to Dashboard</span>
            </NuxtLink>
          </template>

          <template v-else-if="inConversationsWorkspace">
            <div v-if="collapsed" class="flex items-center justify-center w-full">
              <UButton
                :to="orgBase ?? '/dashboard'"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Back to Restaurant"
              />
            </div>
            <NuxtLink
              v-else
              :to="orgBase ?? '/dashboard'"
              class="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-highlighted hover:bg-muted rounded-lg transition-colors w-full"
            >
              <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
              <span class="truncate">Back to Restaurant</span>
            </NuxtLink>
          </template>

          <UDropdownMenu
            v-else
            :items="organizationMenuItems"
            :content="{ align: 'start', collisionPadding: 12 }"
            :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-64' }"
          >
            <UButton
              :avatar="organizationAvatar"
              :label="collapsed ? undefined : organizationLabel"
              trailing-icon="i-lucide-chevrons-up-down"
              color="neutral"
              variant="ghost"
              class="w-full data-[state=open]:bg-elevated"
              :block="collapsed"
              :ui="{ label: 'truncate text-left', trailingIcon: 'text-dimmed ms-auto' }"
            />
          </UDropdownMenu>
        </template>

        <template #default="{ collapsed }">
          <template v-if="inConversationsWorkspace">
            <div class="flex flex-col gap-3 px-2">
              <UTooltip :text="collapsed ? 'New conversation' : undefined">
                <UButton
                  icon="i-heroicons-plus"
                  :label="collapsed ? undefined : 'New conversation'"
                  color="primary"
                  variant="soft"
                  size="sm"
                  :block="!collapsed"
                  @click="newChowBotChat"
                />
              </UTooltip>

              <ClientOnly>
                <div v-if="!collapsed" class="space-y-1">
                  <UButton
                    v-for="conv in siteConversations"
                    :key="conv.id"
                    :label="conv.title"
                    :icon="conv.active_channel === 'whatsapp' ? 'i-simple-icons-whatsapp' : 'i-lucide-message-square'"
                    :color="conv.id === activeConversationId ? 'primary' : 'neutral'"
                    :variant="conv.id === activeConversationId ? 'soft' : 'ghost'"
                    size="sm"
                    class="w-full justify-start"
                    :ui="{ label: 'truncate text-left' }"
                    @click="loadChowBotChat(conv)"
                  />
                  <p v-if="!siteConversations.length" class="px-1 py-2 text-xs text-muted">
                    No conversations yet
                  </p>
                </div>
                <template #fallback>
                  <div v-if="!collapsed" class="space-y-1">
                    <USkeleton v-for="i in 4" :key="i" class="h-8 rounded-lg" />
                  </div>
                </template>
              </ClientOnly>
            </div>
          </template>
          <UNavigationMenu
            v-else
            :collapsed="collapsed"
            :items="navigationItems"
            orientation="vertical"
          />

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
                      to="/dashboard/account/settings"
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

                    <!-- Changelog -->
                    <NuxtLink
                      to="/changelog"
                      class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg text-default hover:text-highlighted hover:bg-muted transition-colors text-left"
                      @click="close"
                    >
                      <span>Changelog</span>
                      <UIcon name="i-lucide-square-pen" class="size-4 text-muted" />
                    </NuxtLink>

                    <!-- Help -->
                    <NuxtLink
                      to="/dashboard/help"
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

      <UDashboardPanel>
        <template #header>
          <UDashboardNavbar>
            <span class="text-sm font-semibold text-highlighted">{{ navbarTitle }}</span>
            <template #left>
              <UDropdownMenu
                v-if="!inAdminWorkspace && restaurant"
                :items="locationMenuItems"
                :content="{ align: 'start', collisionPadding: 12 }"
                :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-64' }"
              >
                <UButton
                  :label="selectedLocation?.title ?? 'No locations'"
                  :avatar="{ icon: 'i-lucide-map-pin' }"
                  trailing-icon="i-lucide-chevrons-up-down"
                  color="neutral"
                  variant="ghost"
                  class="data-[state=open]:bg-elevated"
                  :ui="{ label: 'truncate text-left max-w-48', trailingIcon: 'text-dimmed' }"
                />
              </UDropdownMenu>
            </template>

            <template #right>
              <UColorModeButton variant="ghost" color="neutral" size="sm" />
              <UTooltip v-if="!inAdminWorkspace && !inConversationsWorkspace && restaurant" text="ChowBot">
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

      <ChowBot v-if="!inConversationsWorkspace" />
    </UDashboardGroup>
    <BillingCreditPurchaseModal />
    <BillingServiceUpsellModal />
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'
import { useChowBot } from '~/composables/useChowBot'
import type { ChowBotConv } from '~/composables/useChowBotHistory'
import { useChowBotHistory } from '~/composables/useChowBotHistory'

interface AuthOrganization {
  id: string
  name: string
  slug?: string | null
  logo?: string | null
}

const route = useRoute()
const { data: sessionData, signOut } = useAuth()
const toast = useToast()
const stoppingImpersonation = ref(false)
const dashboard = useDashboardRestaurant()
const organizationsState = authClient.useListOrganizations()

const colorMode = useColorMode()

function getThemeIcon(pref: 'system' | 'light' | 'dark') {
  if (pref === 'system') return 'i-lucide-monitor'
  if (pref === 'light') return 'i-lucide-sun'
  return 'i-lucide-moon'
}

const chowBot = useChowBot()
const chowBotHistory = useChowBotHistory()
const billingStatus = ref<{ billing: { plan: string } } | null>(null)
const platformStatus = ref<'normal' | 'loading' | 'error'>('loading')
const dashboardContextError = ref<unknown>(null)

async function checkPlatformStatus() {
  try {
    const res = await $fetch<{ status: string }>('/api/health')
    if (res.status === 'ok') {
      platformStatus.value = 'normal'
    } else {
      platformStatus.value = 'error'
    }
  } catch (err) {
    console.error('Failed to fetch platform status:', err)
    platformStatus.value = 'error'
  }
}

const organization = dashboard.organization
const restaurant = dashboard.restaurant
const selectedLocation = dashboard.selectedLocation
const locations = dashboard.locations
const activeSiteId = dashboard.siteId

const toggleChowbot = () => chowBot.toggle()
const newChowBotChat = () => chowBot.startNewConversation()
const loadChowBotChat = (conv: ChowBotConv) => chowBot.loadConversation(conv)

const organizations = computed<readonly AuthOrganization[]>(() => unref(organizationsState)?.data ?? [])
const impersonatedBy = computed(() => {
  const session = sessionData.value?.session as { impersonatedBy?: string } | undefined
  return session?.impersonatedBy
})
const inAdminWorkspace = computed(() => route.path.startsWith('/admin'))
const orgSlug = computed(() => organization.value?.slug ?? null)
const orgSettingsBase = computed(() => orgSlug.value ? `/dashboard/${orgSlug.value}/~/settings` : null)

const orgBase = computed(() => orgSlug.value ? `/dashboard/${orgSlug.value}` : null)
const projectBase = computed(() => orgBase.value && selectedLocation.value?.slug ? `${orgBase.value}/${selectedLocation.value.slug}` : orgBase.value)

const locationSlugFromRoute = computed(() => {
  const slug = route.params.locationSlug
  return typeof slug === 'string' ? slug : null
})

const currentLocation = computed(() =>
  locations.value.find(l => l.slug === locationSlugFromRoute.value || l.id === locationSlugFromRoute.value) ?? selectedLocation.value
)

const inLocationWorkspace = computed(() => Boolean(locationSlugFromRoute.value))

const inSettingsWorkspace = computed(() => {
  if (route.path.startsWith('/dashboard/account')) return true
  if (route.path.startsWith('/dashboard/help')) return true
  if (orgSettingsBase.value && route.path.startsWith(orgSettingsBase.value)) return true
  return /^\/dashboard\/[^/]+\/~\/settings/.test(route.path)
})
const inConversationsWorkspace = computed(() => {
  if (!orgBase.value) return /^\/dashboard\/[^/]+\/conversations(?:\/|$)/.test(route.path)
  return route.path === `${orgBase.value}/conversations` || route.path.startsWith(`${orgBase.value}/conversations/`)
})
const siteConversations = computed(() => activeSiteId.value ? chowBotHistory.forSite(activeSiteId.value) : [])
const activeConversationId = computed(() => chowBot.conversationId.value)

const organizationLabel = computed(() => organization.value?.name ?? 'Restaurant')
const organizationAvatar = computed(() => ({
  src: organization.value?.logo ?? undefined,
  alt: organizationLabel.value,
  icon: organization.value?.logo ? undefined : 'i-lucide-building-2'
}))

const organizationMenuItems = computed(() => [
  organizations.value.map((org) => ({
    label: org.name,
    avatar: { src: org.logo ?? undefined, icon: org.logo ? undefined : 'i-lucide-building-2' },
    icon: org.id === organization.value?.id ? 'i-heroicons-check' : undefined,
    onSelect: () => switchOrganization(org.id)
  })),
  [
    {
      label: 'New business',
      icon: 'i-heroicons-plus',
      to: '/dashboard/onboarding'
    }
  ]
])

const locationMenuItems = computed(() => [
  locations.value.map((location) => ({
    label: location.title,
    icon: location.id === selectedLocation.value?.id ? 'i-heroicons-check' : 'i-lucide-map-pin',
    onSelect: () => dashboard.selectLocation(location.id)
  })),
  [
    {
      label: 'All locations',
      icon: 'i-lucide-layout-dashboard',
      to: orgBase.value ?? '/dashboard'
    }
  ]
])

const mainNavigation = computed(() => [
  [
    { label: 'Restaurant', icon: 'i-lucide-layout-dashboard', to: orgBase.value ?? '/dashboard' },
    { label: 'Conversations', icon: 'i-lucide-messages-square', to: orgBase.value ? `${orgBase.value}/conversations` : '/dashboard' },
  ],
  [
    { label: 'Translations', icon: 'i-lucide-languages', to: orgBase.value ? `${orgBase.value}/translations` : '/dashboard' },
    { label: 'Support', icon: 'i-lucide-headphones', to: orgBase.value ? `${orgBase.value}/support` : '/dashboard' },
  ],
  [
    { label: 'Settings', icon: 'i-lucide-settings', to: orgSettingsBase.value ? `${orgSettingsBase.value}/general` : '/dashboard' },
  ],
])

const locationNavigation = computed(() => {
  const project = projectBase.value
  if (!project) return [[]]
  return [
    [
      { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: project },
    ],
    [
      { label: 'Menu', icon: 'i-lucide-utensils', to: `${project}/menu` },
      { label: 'Content', icon: 'i-lucide-files', to: `${project}/content?page=location` },
      { label: 'Posts', icon: 'i-lucide-newspaper', to: `${project}/posts` },
      { label: 'Media', icon: 'i-lucide-images', to: `${project}/media` },
      { label: 'Pages', icon: 'i-lucide-file-text', to: `${project}/pages` },
    ],
    [
      { label: 'Reviews', icon: 'i-lucide-star', to: `${project}/reviews` },
      { label: 'Inbox', icon: 'i-lucide-inbox', to: `${project}/inbox` },
      { label: 'Reservations', icon: 'i-lucide-calendar-check', to: `${project}/reservations` },
      { label: 'Orders', icon: 'i-lucide-shopping-bag', to: `${project}/order` },
    ],
    [
      { label: 'Experiences', icon: 'i-lucide-ticket', to: `${project}/experiences` },
    ],
  ]
})

const adminTab = computed(() => String(route.query.tab || 'queue'))
const adminNavigation = computed(() => [[
  { label: 'Work Queue', icon: 'i-lucide-list-todo',       to: '/admin?tab=work',      active: adminTab.value === 'work' },
  { label: 'Add-ons',  icon: 'i-lucide-inbox',           to: '/admin?tab=queue',     active: adminTab.value === 'queue' },
  { label: 'Clients',  icon: 'i-lucide-building-2',       to: '/admin?tab=clients',   active: adminTab.value === 'clients' },
  { label: 'Members',  icon: 'i-lucide-user-plus',        to: '/admin?tab=members',   active: adminTab.value === 'members' },
  { label: 'Analytics',icon: 'i-lucide-bar-chart-2',      to: '/admin?tab=analytics', active: adminTab.value === 'analytics' },
  { label: 'Domains',  icon: 'i-lucide-globe',            to: '/admin?tab=domains',   active: adminTab.value === 'domains' },
  { label: 'Users',    icon: 'i-lucide-users',            to: '/admin?tab=users',     active: adminTab.value === 'users' },
  { label: 'Content',  icon: 'i-lucide-file-text',        to: '/admin?tab=content',   active: adminTab.value === 'content' },
  { label: 'Blog',     icon: 'i-lucide-pencil',           to: '/admin?tab=blog',      active: adminTab.value === 'blog' },
]])

const _utilityNavigation = computed(() => [[
  { label: 'Account', icon: 'i-lucide-user-cog', to: '/dashboard/account/settings' },
  { label: 'Help', icon: 'i-lucide-circle-help', to: '/dashboard/help' }
]])

const accountSettingsNavigation = computed(() => [[
  { label: 'Account Profile', icon: 'i-lucide-user', to: '/dashboard/account/settings' },
  { label: 'Authentication', icon: 'i-lucide-shield', to: '/dashboard/account/settings/authentication' },
  { label: 'Billing Items', icon: 'i-lucide-receipt', to: '/dashboard/account/settings/billing-items' },
]])

const orgSettingsNavigation = computed(() => {
  const org = orgSettingsBase.value
  if (!org) return [[]]
  return [[
    { label: 'General', icon: 'i-lucide-sliders', to: `${org}/general` },
    { label: 'ChatGPT', icon: 'i-lucide-bot', to: `${org}/chatgpt` },
    { label: 'Domains', icon: 'i-lucide-globe', to: `${org}/domains` },
    { label: 'Billing', icon: 'i-lucide-credit-card', to: `${org}/billing` },
    { label: 'Members', icon: 'i-lucide-users', to: `${org}/members` },
  ]]
})

const settingsNavigation = computed(() => {
  const onOrgSettings = orgSettingsBase.value && route.path.startsWith(orgSettingsBase.value)
  return onOrgSettings ? orgSettingsNavigation.value : accountSettingsNavigation.value
})

const navigationItems = computed(() => {
  if (inAdminWorkspace.value) return adminNavigation.value
  if (inConversationsWorkspace.value) return []
  if (inSettingsWorkspace.value) return settingsNavigation.value
  if (inLocationWorkspace.value) return locationNavigation.value
  return mainNavigation.value
})

const navbarTitle = computed(() => {
  if (inAdminWorkspace.value) return 'Platform Admin'
  const parts = route.path.split('/').filter(Boolean)
  const segment = inLocationWorkspace.value ? parts.at(3) : parts.at(2)
  if (!segment) return 'Overview'
  const labels: Record<string, string> = {
    account: 'Account',
    billing: 'Billing',
    chatgpt: 'ChatGPT',
    conversations: 'Conversations',
    content: 'Content',
    experiences: 'Experiences',
    help: 'Help',
    inbox: 'Inbox',
    locations: 'Locations',
    media: 'Media',
    menu: 'Menu',
    order: 'Orders',
    pages: 'Pages',
    photos: 'Photos',
    posts: 'Posts',
    qa: 'Q&A',
    reservations: 'Reservations',
    reviews: 'Reviews',
    settings: 'Settings',
    setup: 'Setup',
    translations: 'Translations'
  }
  return labels[segment] ?? 'Dashboard'
})

async function switchOrganization(organizationId: string) {
  const organizationApi = authClient.organization as unknown as {
    setActive?: (_input: { organizationId: string }) => Promise<unknown>
  }
  await organizationApi.setActive?.({ organizationId })
  await dashboard.refresh()
  await navigateTo('/dashboard')
}

watch(activeSiteId, (siteId) => {
  if (!import.meta.client || !siteId) return
  chowBotHistory.load(siteId).catch(console.error)
}, { immediate: true })

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
