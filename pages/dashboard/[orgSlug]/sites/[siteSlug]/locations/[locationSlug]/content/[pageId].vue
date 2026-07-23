<template>
  <CmsContentEditor :site-id="siteId" scope="location" :page-id="pageId" />
</template>

<script setup lang="ts">
// SSR is disabled for this route via nuxt.config.ts routeRules (Nitro reads
// it before any Vue rendering starts), not from page meta here — see the
// comment on that entry for why.
definePageMeta({ layout: 'editor' })

const route = useRoute()
const siteId = await useDashboardSiteId()
const pageId = computed(() => String(route.params.pageId ?? ''))
const locationSlug = computed(() => String(route.params.locationSlug ?? ''))

await assertDashboardContentPageAvailable(siteId, pageId.value, 'location', locationSlug.value)

useSeoMeta({ title: 'Content Editor | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
