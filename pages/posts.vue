<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">Latest updates</p>
      <h1 class="saya-display-md text-default"><em class="saya-italic">From the kitchen</em></h1>
    </header>
    <SayaPosts :posts="googlePosts" :show-title="false" />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { googleBusiness } = useBootstrap()
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const restaurantName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Restaurant')

const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/posts')
useSeoMeta({
  title: computed(() => `Updates | ${restaurantName.value}`),
  description: computed(() => `Latest news and updates from ${restaurantName.value}.`),
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl
})
</script>
