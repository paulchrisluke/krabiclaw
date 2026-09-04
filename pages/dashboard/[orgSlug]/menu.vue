<template>
  <UDashboardPanel id="organization-menu">
    <template #header>
      <UDashboardNavbar title="Menu">
        <template #right>
          <DashboardNotificationBell :to="notificationsTo" />
          <DashboardAccountMenu />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full max-w-[var(--ws-page-narrow,45rem)]">
        <DashboardMenuContent @search="openSearch" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardMenuContent from '~/lib/components/workspace/dashboard/DashboardMenuContent.vue'
import DashboardNotificationBell from '~/lib/components/workspace/dashboard/DashboardNotificationBell.vue'
import DashboardAccountMenu from '~/lib/components/workspace/dashboard/DashboardAccountMenu.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

// The mobile counterpart of the desktop slideover. Both render
// DashboardMenuContent, so neither can grow an item the other lacks.
const nuxtApp = useNuxtApp()
const { notificationsTo } = useDashboardMenu()

function openSearch() {
  nuxtApp.hooks.callHook('dashboard:search:toggle')
}
</script>
