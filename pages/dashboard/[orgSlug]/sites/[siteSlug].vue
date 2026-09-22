<template>
  <!--
    A business is one site, so there is no site index: the site's own things are
    rows on Menu and its locations are the Locations tab. This level only
    carries the `/sites/:siteSlug` segment the routes beneath it are built on.
  -->
  <NuxtPage />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', passthrough: true })

const dashboard = useDashboardSite()
// Raised, not thrown: the dashboard renders on the client, where a throw in a nested page's setup leaves a blank screen (DESIGN.md).
if (!dashboard.siteId.value) showError(createError({ statusCode: 404, statusMessage: 'Site not found' }))
</script>
