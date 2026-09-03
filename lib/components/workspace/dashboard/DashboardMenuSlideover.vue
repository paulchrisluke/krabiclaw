<template>
  <USlideover
    v-model:open="open"
    title="Menu"
    :ui="{ body: 'overflow-y-auto' }"
  >
    <template #actions>
      <DashboardNotificationBell :to="notificationsTo" />
    </template>

    <template #body>
      <DashboardMenuContent @search="openSearch" />
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import DashboardMenuContent from './DashboardMenuContent.vue'
import DashboardNotificationBell from './DashboardNotificationBell.vue'

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const nuxtApp = useNuxtApp()
const { notificationsTo } = useDashboardMenu()

function openSearch() {
  open.value = false
  nuxtApp.hooks.callHook('dashboard:search:toggle')
}

// DashboardMenuContent renders plain NuxtLinks, so a selection navigates the
// page underneath the slideover rather than closing it. Close on the resulting
// path change instead of wrapping every item in a click handler.
watch(() => route.path, () => { open.value = false })
</script>
