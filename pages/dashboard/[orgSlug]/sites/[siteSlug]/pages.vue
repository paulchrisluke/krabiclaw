<template>
  <DashboardIndexPanel id="site-pages" title="Pages">
    <TenantPageList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import TenantPageList from '~/components/dashboard/TenantPageList.vue'

// Pages is a row on Menu, which is where Back goes.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug-settings' })

useSeoMeta({ title: 'Pages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
