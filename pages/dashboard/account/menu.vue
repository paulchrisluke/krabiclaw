<template>
  <DashboardIndexPanel id="account-menu" title="Menu">
    <DashboardMenuContent />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import DashboardMenuContent from '~/lib/components/workspace/dashboard/DashboardMenuContent.vue'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | Krabiclaw', robots: 'noindex, nofollow' })
</script>
