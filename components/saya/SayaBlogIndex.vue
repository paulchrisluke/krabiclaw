<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div v-if="pending" class="py-24 text-center text-muted">
        <p class="mb-2 text-xl">Loading posts</p>
        <p class="text-sm">Please wait a moment...</p>
      </div>

      <div v-else-if="error" class="py-24 text-center text-muted">
        <p class="mb-2 text-xl">Unable to load posts</p>
        <p class="text-sm">Please try again in a moment.</p>
      </div>

      <TenantBlogIndex
        v-else
        variant="saya"
        :title="`Stories from ${siteName}`"
        :posts="posts"
        base-path="/blog"
      />
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
  author_name?: string | null
  updated_at?: string | null
  published_at?: string | null
  read_time_minutes?: number | null
  featured_order?: number | null
  featured_image?: { public_url: string | null; kind: string | null } | null
}

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const siteName = computed(() => site?.brand_name || 'Our Site')

const { blogList, error, pending, config } = useBootstrap()
const posts = computed(() => (blogList.value ?? []) as unknown as TenantBlogPost[])

useTenantSocialMetadata(() => ({
  path: '/blog',
  title: `Blog | ${siteName.value}`,
  description: `Stories, news, and updates from ${siteName.value}.`,
  label: 'Blog',
  brand: {
    siteName: siteName.value,
    logoUrl: config.value?.logo_url || null,
    faviconUrl: config.value?.favicon_url || null,
    primaryColor: config.value?.brand_color || null,
  },
}))
</script>
