<template>
  <CmsContentEditor :site-id="siteId" scope="site" :page-id="pageId" />
</template>

<script setup lang="ts">
// SSR is disabled for this route via nuxt.config.ts routeRules (Nitro reads
// it before any Vue rendering starts), not from page meta here — see the
// comment on that entry for why.
definePageMeta({ layout: 'editor' })

const route = useRoute()
// This route uses layout: 'editor', not layout: 'dashboard' — the latter is
// what normally loads dashboard context (see layouts/dashboard.vue). Since
// this page never renders through that layout, nothing else populates it.
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()
const pageId = computed(() => String(route.params.pageId ?? ''))

await assertDashboardContentPageAvailable(siteId, pageId.value, 'site')

useSeoMeta({ title: 'Content Editor | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
