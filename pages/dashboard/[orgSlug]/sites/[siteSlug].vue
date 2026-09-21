<template>
  <!--
    A business is one site, so there is no site hub: the site's own things are
    rows on Menu and its locations are the Locations tab. This level only
    carries the `/sites/:siteSlug` segment the routes beneath it are built on.
  -->
  <NuxtPage />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', passthrough: true })

const dashboard = useDashboardSite()
if (!dashboard.siteId.value) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
</script>
