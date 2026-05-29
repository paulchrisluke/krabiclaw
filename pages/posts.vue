<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">Latest updates</p>
      <h1 class="saya-display-md text-default">
        <em class="saya-italic">{{ postsCopy.postsEyebrow }}</em>
      </h1>
    </header>

    <!-- Post grid -->
    <SayaPosts :posts="visiblePosts" :show-title="false" />

    <!-- Load more -->
    <div v-if="hasMore" class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 text-center">
      <button
        class="inline-flex items-center gap-2 rounded-full border border-default px-8 py-3 text-[11px] font-medium uppercase tracking-widest text-default transition hover:bg-muted"
        @click="loadMore"
      >
        Show more <span class="opacity-50">({{ remaining }} remaining)</span>
      </button>
    </div>

    <!-- Empty state when no posts at all -->
    <div
      v-if="googlePosts.length === 0"
      class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"
    >
      <div class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-default bg-muted/20 py-20 text-center">
        <div class="flex size-14 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
          <UIcon name="i-heroicons-newspaper" class="size-7" />
        </div>
        <h3 class="mt-6 saya-display saya-italic text-3xl text-default">Nothing posted yet.</h3>
        <p class="mt-2 max-w-sm text-sm text-muted">Check back soon for updates, events, and announcements.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const postsCopy = getVerticalCopy(site?.vertical)

const { googleBusiness } = useBootstrap()
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const restaurantName = computed(() => site?.brand_name || googleBusiness.value?.business?.title || 'Our Restaurant')

// Progressive reveal — 6 at a time
const PAGE_SIZE = 6
const visibleCount = ref(PAGE_SIZE)
const visiblePosts = computed(() => googlePosts.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < googlePosts.value.length)
const remaining = computed(() => googlePosts.value.length - visibleCount.value)
function loadMore() { visibleCount.value += PAGE_SIZE }

const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/posts')
useSeoMeta({
  title: computed(() => `Updates | ${restaurantName.value}`),
  description: computed(() => `Latest news and updates from ${restaurantName.value}.`),
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl
})
</script>
