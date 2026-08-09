<template>
  <UButton
    v-if="sidebar"
    class="hidden shrink-0 md:flex"
    color="neutral"
    variant="ghost"
    :icon="sidebarCollapsed ? appConfig.ui.icons.panelOpen : appConfig.ui.icons.panelClose"
    :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
    :data-sidebar-control-ready="ready"
    @click="toggleSidebar"
  />
  <UButton
    v-else-if="mobileBackPath"
    class="shrink-0 md:hidden"
    color="neutral"
    variant="ghost"
    icon="i-lucide-chevron-left"
    aria-label="Back"
    :to="mobileBackPath"
  />
</template>

<script setup lang="ts">
defineProps<{ sidebar?: boolean }>()

const appConfig = useAppConfig()
const nuxtApp = useNuxtApp()
const route = useRoute()
const sidebarCollapsed = useState<boolean>('dashboard-sidebar-collapsed', () => false)
const ready = ref(false)

const mobileBackPath = computed(() => {
  const path = route.path.replace(/\/$/, '')
  const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
  const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
  const locationSlug = typeof route.params.locationSlug === 'string' ? route.params.locationSlug : null

  if (orgSlug) {
    const orgBase = `/dashboard/${orgSlug}`
    if (locationSlug && siteSlug) {
      const locationsBase = `${orgBase}/sites/${siteSlug}/locations`
      const locationBase = `${locationsBase}/${locationSlug}`
      return path === locationBase ? locationsBase : locationBase
    }
    if (siteSlug) {
      const siteBase = `${orgBase}/sites/${siteSlug}`
      return path === siteBase ? orgBase : siteBase
    }
    return path === orgBase ? null : orgBase
  }

  if (path === '/dashboard/account') return '/dashboard'
  if (path.startsWith('/dashboard/account/')) return '/dashboard/account'
  if (path.startsWith('/admin/')) return '/admin'
  return null
})

onMounted(() => {
  ready.value = true
})

function toggleSidebar() {
  const collapsed = !sidebarCollapsed.value
  sidebarCollapsed.value = collapsed
  void nuxtApp.hooks.callHook('dashboard:sidebar:collapse', collapsed)
}
</script>
