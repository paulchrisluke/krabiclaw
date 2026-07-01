<template>
  <div class="min-h-screen bg-default text-default">
    <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">Blog</p>
      <h1 class="saya-display-md text-default">
        <em class="saya-italic">Stories from {{ siteName }}</em>
      </h1>
    </header>

    <div class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
    <div v-if="error" class="py-24 text-center text-muted">
      <p class="mb-2 text-xl">Unable to load posts</p>
      <p class="text-sm">Please try again in a moment.</p>
    </div>

    <div v-else-if="posts.length === 0" class="py-24 text-center text-muted">
      <p class="mb-2 text-xl">No posts yet</p>
      <p class="text-sm">Check back soon — new stories are on the way.</p>
    </div>

      <div v-else class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="post in posts"
          :key="post.id"
          :to="`/blog/${post.slug}`"
          class="block"
        >
          <div class="h-full overflow-hidden rounded-xl border border-default bg-elevated shadow-sm transition-shadow hover:shadow-md">
            <div v-if="resolveMedia(post.featured_image).url" class="h-48 overflow-hidden">
              <UImage
                :src="resolveMedia(post.featured_image).url ?? undefined"
                :alt="post.title"
                class="h-full w-full object-cover"
              />
            </div>
            <div v-else class="h-48 bg-linear-to-br from-stone-50 to-stone-100 dark:from-stone-900/20 dark:to-stone-800/20" />
            <div class="p-6">
              <div class="mb-3 flex items-center gap-3">
                <span v-if="post.category" class="rounded bg-muted px-2 py-1 text-xs font-medium text-muted">
                  {{ post.category }}
                </span>
                <span v-if="post.published_at" class="text-sm text-dimmed">
                  <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
                </span>
              </div>
              <h3 class="mb-3 text-xl font-bold text-default">{{ post.title }}</h3>
              <p v-if="post.excerpt" class="mb-4 text-muted">{{ post.excerpt }}</p>
              <span class="text-sm font-semibold text-primary">Read More →</span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface TenantBlogPost {
  id: string
  slug: string
  title: string
  excerpt?: string | null
  category?: string | null
  published_at?: string | null
  featured_image?: { public_url: string | null; kind: string | null } | null
}

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { resolveMedia } = useMedia()
const siteName = computed(() => site?.brand_name || 'Our Site')

const { blogList, error } = useBootstrap()
const posts = computed(() => (blogList.value ?? []) as unknown as TenantBlogPost[])

const currentPageUrl = useSeoUrl('/blog')
useSeoMeta({
  title: computed(() => `Blog | ${siteName.value}`),
  description: computed(() => `Stories, news, and updates from ${siteName.value}.`),
  ogTitle: computed(() => `Blog | ${siteName.value}`),
  ogDescription: computed(() => `Stories, news, and updates from ${siteName.value}.`),
  ogSiteName: siteName,
  twitterTitle: computed(() => `Blog | ${siteName.value}`),
  twitterDescription: computed(() => `Stories, news, and updates from ${siteName.value}.`),
  ogImage: useTenantOgImage(),
  ogUrl: currentPageUrl,
})
</script>
