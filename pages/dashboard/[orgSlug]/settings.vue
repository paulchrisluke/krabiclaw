<template>
  <!--
    Menu: the business's own page, a tab root. Its rows are the site's lists
    and settings, each a level below; the bell and the account hang off it.
  -->
  <DashboardIndexPanel id="organization-settings" title="Menu">
    <template #right>
      <DashboardNotificationBell :to="notificationsTo" />
      <DashboardAccountMenu />
    </template>
    <DashboardMenuContent @search="openSearch" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import DashboardMenuContent from '~/lib/components/workspace/dashboard/DashboardMenuContent.vue'
import DashboardNotificationBell from '~/lib/components/workspace/dashboard/DashboardNotificationBell.vue'
import DashboardAccountMenu from '~/lib/components/workspace/dashboard/DashboardAccountMenu.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const nuxtApp = useNuxtApp()
const { notificationsTo } = useDashboardMenu()

function openSearch() {
  nuxtApp.hooks.callHook('dashboard:search:toggle')
}
</script>
