<template>
  <!--
    Menu: the business's own page, a tab root. Its rows are the site's lists
    and settings, each a level below.

    Search and the bell hang off it, and nothing else: the dashboard has one
    search and this is where it lives. The account avatar is in the header at
    every width, so drawing one here put two of the same control on screen.
  -->
  <DashboardIndexPanel id="organization-settings" title="Menu">
    <template #right>
      <UButton
        icon="i-lucide-search"
        aria-label="Search"
        color="neutral"
        variant="ghost"
        square
        data-testid="dashboard-search"
        @click="openSearch"
      />
      <DashboardNotificationBell :to="notificationsTo" />
    </template>
    <DashboardMenuContent />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import DashboardMenuContent from '~/lib/components/workspace/dashboard/DashboardMenuContent.vue'
import DashboardNotificationBell from '~/lib/components/workspace/dashboard/DashboardNotificationBell.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const nuxtApp = useNuxtApp()
const { notificationsTo } = useDashboardMenu()

function openSearch() {
  nuxtApp.hooks.callHook('dashboard:search:toggle')
}
</script>
