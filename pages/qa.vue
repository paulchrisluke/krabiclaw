<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ t('saya.qa.title') }}</p>
      <h1 class="saya-display-md text-default"><em class="saya-italic">{{ t('saya.qa_page.title') }}</em></h1>
      <p class="mt-5 max-w-xl text-sm leading-relaxed text-muted">{{ t('saya.qa_page.intro') }}</p>

      <!-- Multi-location pills -->
      <div v-if="locations.length > 1" class="mt-8 flex flex-wrap gap-3">
        <NuxtLink
          v-for="loc in locations"
          :key="loc.id"
          :to="localePath(`/locations/${loc.slug}/qa`)"
          class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
        >
          <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
          {{ loc.title }}
        </NuxtLink>
      </div>
    </header>
    <LazySayaQA :qa="qaList" :show-title="false" />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { localePath, t } = useI18n()

const { googleBusiness, qaList, locations, config, site: publicSite } = await usePublicPageData()
const siteName = computed(() => site?.brand_name?.trim() || googleBusiness.value?.business?.title?.trim() || '')

useSocialMetadata(() => ({
  path: '/qa',
  title: `${t('saya.qa.title')} | ${siteName.value}`,
  description: t('saya.qa_page.meta_description', { site: siteName.value }),
  label: t('saya.qa.title'),
  brand: {
    siteName: siteName.value,
    logoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || null,
    faviconUrl: publicSite.value?.media.find(item => item.slot === 'favicon')?.public_url || null,
    primaryColor: config.value?.brand_color || null,
  },
}))
</script>
