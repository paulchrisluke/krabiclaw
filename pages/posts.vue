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
          <UIcon name="i-heroicons-map-pin" class="size-3.5 opacity-70" />
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

    <!-- Empty state when no posts at all -->
    <div
      v-if="googlePosts.length === 0"
      class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"
    >
        <UCard class="rounded-3xl border-dashed bg-muted/20" :ui="{ body: 'flex flex-col items-center py-20 text-center' }">
          <div class="flex size-14 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
            <UIcon name="i-heroicons-newspaper" class="size-7" />
          </div>
          <h3 class="mt-6 saya-display saya-italic text-3xl text-default">{{ $t('saya.posts.empty_title') }}</h3>
          <p class="mt-2 max-w-sm text-sm text-muted">{{ $t('saya.posts.empty_desc') }}</p>
        </UCard>
      </div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { locale } = useI18n()
const postsCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))

const { googleBusiness, locations } = useBootstrap()
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const siteName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Site')

// Progressive reveal — 6 at a time
const PAGE_SIZE = 6
const visibleCount = ref(PAGE_SIZE)
const visiblePosts = computed(() => googlePosts.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < googlePosts.value.length)
const remaining = computed(() => googlePosts.value.length - visibleCount.value)
function loadMore() { visibleCount.value += PAGE_SIZE }

const currentPageUrl = useSeoUrl('/posts')
useSeoMeta({
  title: computed(() => `Updates | ${siteName.value}`),
  description: computed(() => `Latest news and updates from ${siteName.value}.`),
  ogTitle: computed(() => `Updates | ${siteName.value}`),
  ogDescription: computed(() => `Latest news and updates from ${siteName.value}.`),
  ogSiteName: computed(() => siteName.value),
  twitterTitle: computed(() => `Updates | ${siteName.value}`),
  twitterDescription: computed(() => `Latest news and updates from ${siteName.value}.`),
  ogImage: useTenantOgImage(),
  ogUrl: currentPageUrl
})
</script>
