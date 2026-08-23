<template>
  <div v-if="pending" class="mx-auto max-w-3xl space-y-4 px-4 py-16 sm:px-6 lg:px-8">
    <div class="h-6 w-1/4 animate-pulse rounded bg-elevated" />
    <div class="h-12 w-3/4 animate-pulse rounded bg-elevated" />
    <div class="mt-8 space-y-3">
      <div v-for="i in 10" :key="i" class="h-4 animate-pulse rounded bg-elevated" :style="`width: ${70 + (i % 3) * 10}%`" />
    </div>
  </div>

  <div v-else-if="post" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 lg:px-8">
    <aside class="mb-8 lg:sticky lg:top-28 lg:mb-0 lg:h-fit">
      <PlatformCommandSearchTrigger surface="tenant_blog" variant="saya" label="Search stories..." aria-label="Open story search" class="mb-6" />
      <BlogCategoryNav :categories="categories" base-path="/blog" :active-slug="post?.slug" />
    </aside>

    <article class="min-w-0">
    <div class="mx-auto max-w-4xl">
    <BlogArticleView :title="post.title" :excerpt="post.excerpt" :category="post.category" :published-at="post.published_at" :updated-at="wasUpdated ? post.updated_at : null" :author-name="authorName" :site-name="siteName" :media-url="postMedia.url" :media-kind="postMedia.isVideo ? 'video' : 'image'" :read-minutes="readTime" :blocks="post.content_blocks" template="saya" />

    <div class="mt-16 flex items-center justify-between gap-6 border-t border-default pt-8">
      <div>
        <p class="text-sm font-semibold text-default">{{ authorName }}</p>
        <p class="text-sm text-dimmed">More stories and updates from {{ siteName }}</p>
      </div>
      <PlatformButton to="/blog" variant="outline" size="sm">More Posts</PlatformButton>
    </div>
    </div>

    <div v-if="relatedPosts.length" class="mx-auto mt-16 max-w-4xl border-t border-default pt-10">
      <h2 class="mb-6 text-xl font-bold text-default">More from {{ siteName }}</h2>
      <div class="grid gap-6 sm:grid-cols-2">
        <NuxtLink
          v-for="relatedPost in relatedPosts"
          :key="relatedPost.id"
          :to="`/blog/${relatedPost.slug}`"
          class="block rounded-xl border border-default bg-elevated p-5 no-underline transition-shadow hover:shadow-md"
        >
          <h3 class="text-base font-semibold text-default">{{ relatedPost.title }}</h3>
          <p v-if="relatedPost.excerpt" class="mt-2 line-clamp-2 text-sm text-muted">{{ relatedPost.excerpt }}</p>
        </NuxtLink>
      </div>
    </div>
    </article>
  </div>

  <div v-else class="mx-auto max-w-3xl px-4 py-32 text-center">
    <h1 class="text-2xl font-bold text-default">Post not found</h1>
    <p class="mt-3 text-muted">This post may have been moved or removed.</p>
    <PlatformButton to="/blog" variant="outline" size="sm" class="mt-6">More Posts</PlatformButton>
  </div>

  <PlatformCommandSearchModal surface="tenant_blog" variant="saya" />
</template>

<script setup lang="ts">
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import { structuredComponentsFromBlocks } from '~/utils/blog-editor'

const { isTenant, siteId, site } = useTenantSite()
if (!isTenant || !siteId) throw createError({ statusCode: 404 })

definePageMeta({ layout: 'saya', middleware: 'tenant-blog-canonical' })

const { resolveMedia } = useMedia()

interface TenantBlogPost {
  id: string
  title: string
  slug: string
  body: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_title?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  visibility?: 'public' | 'unlisted'
  published_at?: string | null
  author_name?: string | null
  updated_at?: string | null
  featured_order?: number | null
  featured_image?: { public_url: string | null; kind: string | null; width: number | null; height: number | null } | null
  primary_image?: { public_url: string | null; thumbnail_url: string | null; width: number | null; height: number | null } | null
  components?: ContentComponent[]
  content_blocks?: import('~/lib/components/workspace/blog/types').BlogEditorBlock[] | null
}

const route = useRoute()
const requestEvent = useRequestEvent()
const postEndpoint = computed(() => `/api/public/sites/${siteId}/blog/${String(route.params.slug)}`)

interface PublicBlogResponse {
  post: TenantBlogPost | null
}

const isPublicBlogResponse = (value: unknown): value is PublicBlogResponse =>
  isRecord(value)
  && (value.post === null || (
    isRecord(value.post)
    && typeof value.post.id === 'string'
    && typeof value.post.title === 'string'
    && typeof value.post.slug === 'string'
  ))

const { data, pending, error } = await useAsyncData(
  () => `tenant-blog-post-${siteId}-${String(route.params.slug)}`,
  async () => {
    let post: TenantBlogPost | null | undefined

    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

      const [{ cloudflareEnv }, { getPublishedSiteBlogPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      post = await getPublishedSiteBlogPost(db, siteId, String(route.params.slug)) as TenantBlogPost | null
    } else {
      let payload: PublicBlogResponse
      try {
        payload = await publicApiRequest<PublicBlogResponse>(postEndpoint.value, {
          validate: isPublicBlogResponse,
        })
      } catch (err) {
        const statusCode = typeof err === 'object' && err !== null
          ? Number((err as { statusCode?: unknown; status?: unknown }).statusCode ?? (err as { status?: unknown }).status)
          : undefined
        if (statusCode === 404) {
          throw createError({ statusCode: 404, statusMessage: 'Post not found' })
        }
        throw err
      }
      post = payload.post
    }

    if (!post) {
      throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    }

    return { post }
  },
)

// A fetch failure leaves data.value undefined, same as a genuinely missing
// post — re-throw the real error first so outages aren't misreported as 404.
if (error.value) {
  throw error.value
}

if (!data.value?.post) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}
if (!Array.isArray(data.value.post.content_blocks) || data.value.post.content_blocks.length === 0) {
  throw createError({ statusCode: 500, statusMessage: 'Published blog content is missing its canonical blocks' })
}

const post = computed(() => data.value?.post ?? null)
const { blogList, config } = await usePublicPageData()
const allPosts = computed(() => (blogList.value ?? []) as unknown as TenantBlogPost[])
const { categories } = useTenantBlogNav(allPosts)
const relatedPosts = computed(() => allPosts.value.filter(item => item.slug !== post.value?.slug).slice(0, 4))
const siteName = computed(() => site?.brand_name?.trim() ?? '')
const authorName = computed(() => post.value?.author_name?.trim() || siteName.value)
const readTime = computed(() => {
  const words = (post.value?.body ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
})
const wasUpdated = computed(() => {
  if (!post.value?.updated_at || !post.value?.published_at) return false
  const updatedDate = new Date(post.value.updated_at)
  const publishedDate = new Date(post.value.published_at)
  if (Number.isNaN(updatedDate.getTime()) || Number.isNaN(publishedDate.getTime())) return false
  return Math.abs(updatedDate.getTime() - publishedDate.getTime()) > 60_000
})

const renderableComponents = computed(() =>
  structuredComponentsFromBlocks(post.value?.content_blocks ?? []),
)

const selectedPostImage = computed(() => {
  const primary = post.value?.primary_image
  if (primary?.public_url) return { public_url: primary.public_url, kind: 'image', width: primary.width, height: primary.height }
  return post.value?.featured_image ?? null
})
const postMedia = computed(() => resolveMedia(selectedPostImage.value))
const primaryBackground = computed(() => post.value?.primary_image?.public_url || null)

const postPath = computed(() => `/blog/${post.value?.slug ?? ''}`)
const requestURL = useRequestURL()
const resolvedSeo = computed(() => resolveBlogSeo({
  title: post.value?.title || 'Blog', seoTitle: post.value?.seo_title, excerpt: post.value?.excerpt,
  seoDescription: post.value?.seo_description, slug: post.value?.slug || '', canonicalUrl: post.value?.canonical_url,
  baseUrl: requestURL.origin, publicPath: postPath.value, siteName: siteName.value,
  robots: post.value?.visibility === 'unlisted' ? 'noindex,follow' : post.value?.robots,
}))

const { canonicalUrl } = useTenantSocialMetadata(() => ({
  path: resolvedSeo.value.canonicalUrl,
  title: resolvedSeo.value.title,
  description: resolvedSeo.value.description,
  pageType: 'article',
  label: post.value?.category || null,
  author: authorName.value,
  publishedAt: post.value?.published_at || null,
  robots: resolvedSeo.value.robots,
  brand: {
    siteName: siteName.value,
    logoUrl: config.value?.logo_url || null,
    faviconUrl: config.value?.favicon_url || null,
    primaryColor: config.value?.brand_color || null,
  },
  heroImage: primaryBackground.value ? { url: primaryBackground.value } : null,
}))

useHead(() => ({
  meta: [
    ...(post.value?.seo_keywords?.trim() ? [{ name: 'keywords', content: post.value.seo_keywords.trim() }] : []),
  ],
}))

useContentPageSchema(computed(() => {
  if (!post.value) return null
  return {
    articleType: 'BlogPosting' as const,
    url: canonicalUrl.value,
    title: post.value.title,
    description: resolvedSeo.value.description,
    imageUrl: postMedia.value.url || undefined,
    imageWidth: selectedPostImage.value?.width ?? undefined,
    imageHeight: selectedPostImage.value?.height ?? undefined,
    datePublished: post.value.published_at,
    dateModified: post.value.updated_at,
    authorName: authorName.value,
    articleSection: post.value.category || undefined,
    keywords: post.value.seo_keywords || undefined,
    inLanguage: 'en-US',
    breadcrumbs: [
      { name: 'Blog', url: '/blog' },
      { name: post.value.title, url: postPath.value },
    ],
    components: renderableComponents.value,
    siteName: siteName.value,
    siteLogoUrl: site?.logo_url || undefined,
    siteDescription: site?.brand_description || undefined,
  }
}))
</script>
