<template>
  <UButton
    class="hidden lg:flex"
    color="neutral"
    variant="ghost"
    :icon="sidebarCollapsed ? appConfig.ui.icons.panelOpen : appConfig.ui.icons.panelClose"
    :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
    :data-sidebar-control-ready="ready"
    @click="toggleSidebar"
  />
</template>

<script setup lang="ts">
const appConfig = useAppConfig()
const nuxtApp = useNuxtApp()
const sidebarCollapsed = useState<boolean>('dashboard-sidebar-collapsed', () => false)
const ready = ref(false)

onMounted(() => {
  ready.value = true
})

function toggleSidebar() {
  const collapsed = !sidebarCollapsed.value
  sidebarCollapsed.value = collapsed
  void nuxtApp.hooks.callHook('dashboard:sidebar:collapse', collapsed)
}
</script>
