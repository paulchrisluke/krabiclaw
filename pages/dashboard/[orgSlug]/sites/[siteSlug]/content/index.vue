<template>
  <UDashboardPanel id="site-content">
    <template #header>
      <UDashboardNavbar title="Content">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ContentPageIndex :site-id="siteId" scope="site" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const siteId = await useDashboardSiteId()

useSeoMeta({ title: 'Content | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
