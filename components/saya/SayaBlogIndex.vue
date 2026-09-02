<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div v-if="pending" class="py-24 text-center text-muted">
        <p class="mb-2 text-xl">{{ t('saya.search.searching', { surface: t('saya.search.articles') }) }}</p>
      </div>

      <div v-else-if="error" class="py-24 text-center text-muted">
        <p class="mb-2 text-xl">{{ t('saya.common.temporarily_unavailable') }}</p>
      </div>

      <TenantBlogIndex
        v-else
        variant="saya"
        :title="locale === 'en' ? `Stories from ${siteName}` : t('saya.posts.title')"
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
  updated_at?: string | null
  published_at?: string | null
  read_time_minutes?: number | null
  featured_order?: number | null
  media?: Array<{ asset_id: string; slot: string; public_url: string | null; kind: string | null }>
}

const { siteId, draftId, site } = useTenantSite()
const { locale, t } = useI18n()
if (!siteId && !draftId) throw createError({ statusCode: 404 })

const siteName = computed(() => site?.brand_name?.trim() ?? '')

const { blogList, error, pending } = await usePublicPageData()
const posts = computed(() => (blogList.value ?? []) as unknown as TenantBlogPost[])

useSocialMetadata(() => ({
  path: '/blog',
  title: locale.value === 'en' ? `Blog | ${siteName.value}` : t('saya.footer.blog'),
  description: locale.value === 'en' ? `Stories, news, and updates from ${siteName.value}.` : '',
  brand: {
    siteName: siteName.value,
  },
}))
</script>
