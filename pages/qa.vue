<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">Q&A</p>
      <h1 class="saya-display-md text-default"><em class="saya-italic">Frequently</em> asked</h1>
      <p class="mt-5 max-w-xl text-sm leading-relaxed text-muted">Questions asked by guests on Google. Owner-answered questions are pinned to the top.</p>
    </header>
    <SayaQA :qa="googleQA" :show-title="false" />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { googleBusiness } = useBootstrap()
const googleQA = computed(() => googleBusiness.value?.qa || [])
const restaurantName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Restaurant')

const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/qa')
useSeoMeta({
  title: computed(() => `Q&A | ${restaurantName.value}`),
  description: computed(() => `Frequently asked questions about ${restaurantName.value}.`),
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl
})
</script>
