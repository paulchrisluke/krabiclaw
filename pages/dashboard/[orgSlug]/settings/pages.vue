<template>
  <DashboardIndexPanel id="organization-pages" title="Pages">
    <TenantPageList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import TenantPageList from '~/components/dashboard/TenantPageList.vue'

// A row on Menu, nested under it so Menu is both its pane and its Back; the URL stays `/pages`.
definePageMeta({ layout: 'dashboard', path: '/dashboard/:orgSlug/pages' })

useSeoMeta({ title: 'Pages | Krabiclaw Dashboard', robots: 'noindex, nofollow' })
</script>
