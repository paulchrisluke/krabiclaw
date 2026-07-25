<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ $t('saya.posts.title') }}</p>
      <h1 class="saya-display-md text-default">
        <em class="saya-italic">{{ postsCopy.postsEyebrow }}</em>
      </h1>

      <!-- Multi-location pills -->
      <div v-if="locations.length > 1" class="mt-8 flex flex-wrap gap-3">
        <NuxtLink
          v-for="loc in locations"
          :key="loc.id"
          :to="`/locations/${loc.slug}/posts`"
          class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
        >
          <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
          {{ loc.title }}
        </NuxtLink>
      </div>
    </header>

    <!-- Post grid -->
    <LazySayaPosts :posts="visiblePosts" :show-title="false" />

    <!-- Load more -->
    <div v-if="hasMore" class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 text-center">
      <button
        class="inline-flex items-center gap-2 rounded-full border border-default px-8 py-3 text-[11px] font-medium uppercase tracking-widest text-default transition hover:bg-muted"
        @click="loadMore"
      >
        {{ $t('saya.posts.show_more') }} <span class="opacity-50">({{ remaining }} {{ $t('saya.posts.remaining') }})</span>
      </button>
    </div>

  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { locale } = useI18n()
const postsCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))

const { googleBusiness, locations, config } = await useBootstrap()
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const siteName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Site')

// Progressive reveal — 6 at a time
const PAGE_SIZE = 6
const visibleCount = ref(PAGE_SIZE)
const visiblePosts = computed(() => googlePosts.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < googlePosts.value.length)
const remaining = computed(() => googlePosts.value.length - visibleCount.value)
function loadMore() { visibleCount.value += PAGE_SIZE }

useTenantSocialMetadata(() => ({
  path: '/posts',
  title: `Updates | ${siteName.value}`,
  description: `Latest news and updates from ${siteName.value}.`,
  label: 'Updates',
  brand: {
    siteName: siteName.value,
    logoUrl: config.value?.logo_url || null,
    faviconUrl: config.value?.favicon_url || null,
    primaryColor: config.value?.brand_color || null,
  },
}))
</script>
