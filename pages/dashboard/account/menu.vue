<template>
  <DashboardIndexPanel id="account-menu" title="Menu">
    <DashboardMenuContent />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import DashboardMenuContent from '~/lib/components/workspace/dashboard/DashboardMenuContent.vue'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | Krabiclaw', robots: 'noindex, nofollow' })

// This is Personal's Menu. With an organization active, Menu is that
// organization's — where Back from Account settings belongs.
const { menuPageTo } = useDashboardMenu()
watch(menuPageTo, to => { if (to !== '/dashboard/account/menu') void navigateTo(to, { replace: true }) }, { immediate: true })
</script>
