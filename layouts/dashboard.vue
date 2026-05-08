<template>
  <div class="platform-theme">
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
          <div v-if="collapsed" class="flex items-center justify-center">
            <div class="flex size-8 items-center justify-center rounded-lg bg-primary-600">
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

        <template #default="{ collapsed }">
          <UNavigationMenu
            :collapsed="collapsed"
            :items="navigationItems"
            orientation="vertical"
          />
        </template>

        <template #footer="{ collapsed }">
          <UButton
            :avatar="{
              src: sessionData?.user?.image,
              loading: 'lazy',
              alt: sessionData?.user?.name || 'User avatar'
            }"
            :label="collapsed ? undefined : sessionData?.user?.name"
            color="neutral"
            variant="ghost"
            class="w-full"
            :block="collapsed"
            @click="handleSignOut"
          />
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
            </template>
          </UDashboardNavbar>
        </template>

        <template #body>
          <slot />
        </template>
      </UDashboardPanel>
    </UDashboardGroup>
  </div>
</template>

<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

interface DashboardSite {
  id: string
  name: string
  subdomain: string
  status: string
}

const route = useRoute()
const router = useRouter()
const { data: sessionData, signOut } = useAuth()

const siteContext = ref<any>(null)
const sites = ref<DashboardSite[]>([])
const selectedSiteId = ref<string | null>(null)

const routeSiteId = computed(() => {
  const param = route.params.siteId || route.params.id
  return typeof param === 'string' && route.path.startsWith('/dashboard/sites/') ? param : null
})

const inSiteWorkspace = computed(() => Boolean(routeSiteId.value))
const activeSiteId = computed(() => routeSiteId.value || selectedSiteId.value)

const selectedSiteLabel = computed(() =>
  siteContext.value?.name
    || sites.value.find(site => site.id === selectedSiteId.value)?.name
    || 'Choose a website'
)

const sitePath = (path = '', query?: Record<string, string>) => ({
  path: `/dashboard/sites/${activeSiteId.value}${path}`,
  query
})

const navbarTitle = computed(() => {
  if (!inSiteWorkspace.value || !siteContext.value) return 'Dashboard'
  return siteContext.value.name
})

const platformNavigation = computed(() => [[
  { label: 'Dashboard', icon: 'i-heroicons-home', to: '/dashboard' },
  { label: 'Sites', icon: 'i-heroicons-globe-alt', to: '/dashboard/sites' },
  { label: 'Billing', icon: 'i-heroicons-credit-card', to: '/dashboard/billing' },
  { label: 'Integrations', icon: 'i-heroicons-link', to: '/dashboard/integrations' }
]])

const selectedSiteButton = computed(() => ({
  label: selectedSiteLabel.value,
  icon: 'i-heroicons-globe-alt'
}))

const siteMenuItems = computed(() => [
  sites.value.map(site => ({
    label: site.name,
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

const siteNavigation = computed(() => [[
  { label: 'Overview', icon: 'i-heroicons-home', to: sitePath() },
  { label: 'Content', icon: 'i-heroicons-document-text', to: sitePath('/content') },
  { label: 'Menu', icon: 'i-heroicons-list-bullet', to: sitePath('/menu') },
  { label: 'Locations', icon: 'i-heroicons-map-pin', to: sitePath('/locations') },
  { label: 'Launch', icon: 'i-heroicons-rocket-launch', to: sitePath('/launch') },
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth', to: sitePath('/settings') }
], [
  { label: 'All Sites', icon: 'i-heroicons-squares-2x2', to: '/dashboard/sites' },
  { label: 'Billing', icon: 'i-heroicons-credit-card', to: '/dashboard/billing' },
  { label: 'Integrations', icon: 'i-heroicons-link', to: '/dashboard/integrations' }
]])

const navigationItems = computed(() => {
  if (!activeSiteId.value || !routeSiteId.value) return platformNavigation.value
  return siteNavigation.value
})

const loadSites = async () => {
  const response = await $fetch<{ sites: DashboardSite[] }>('/api/sites')
  sites.value = response.sites || []

  if (routeSiteId.value) {
    selectedSiteId.value = routeSiteId.value
  } else if (!selectedSiteId.value && sites.value.length > 0) {
    selectedSiteId.value = sites.value[0]!.id
  }
}

const loadSiteContext = async () => {
  if (!activeSiteId.value) {
    siteContext.value = null
    return
  }

  const settingsResponse = await $fetch<any>(`/api/sites/${activeSiteId.value}/settings`)

  if (settingsResponse.success) siteContext.value = settingsResponse.settings
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
  await loadSiteContext()
})

async function handleSignOut() {
  await signOut()
  await navigateTo('/login')
}
</script>
