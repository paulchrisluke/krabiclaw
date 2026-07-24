<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">Q&A</p>
      <h1 class="saya-display-md text-default"><em class="saya-italic">Frequently</em> asked</h1>
      <p class="mt-5 max-w-xl text-sm leading-relaxed text-muted">Questions asked by guests on Google. Owner-answered questions are pinned to the top.</p>

      <!-- Multi-location pills -->
      <div v-if="locations.length > 1" class="mt-8 flex flex-wrap gap-3">
        <NuxtLink
          v-for="loc in locations"
          :key="loc.id"
          :to="`/locations/${loc.slug}/qa`"
          class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
        >
          <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
          {{ loc.title }}
        </NuxtLink>
      </div>
    </header>
    <LazySayaQA :qa="googleQA" :show-title="false" />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { googleBusiness, qaList, locations, config } = await useBootstrap()
const googleQA = computed(() => qaList.value || [])
const siteName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Site')

useTenantSocialMetadata(() => ({
  path: '/qa',
  title: `Q&A | ${siteName.value}`,
  description: `Frequently asked questions about ${siteName.value}.`,
  label: 'Q&A',
  brand: {
    siteName: siteName.value,
    logoUrl: config.value?.logo_url || null,
    faviconUrl: config.value?.favicon_url || null,
    primaryColor: config.value?.brand_color || null,
  },
}))
</script>
