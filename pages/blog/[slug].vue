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
      <BlogCategoryNav :categories="categories" :base-path="blogBasePath" :active-slug="post?.slug" />
    </aside>

    <article class="min-w-0">
    <div class="mx-auto max-w-4xl">
    <BlogArticleView :title="post.title" :excerpt="post.excerpt" :category="post.category" :published-at="post.published_at" :updated-at="wasUpdated ? post.updated_at : null" :author-name="authorName" :author-image="authorImage" :site-name="siteName" :media-url="postMedia.url" :media-kind="postMedia.isVideo ? 'video' : 'image'" :read-minutes="readTime" :blocks="post.content_blocks" template="saya" />

    <div class="mt-16 flex items-center justify-between gap-6 border-t border-default pt-8">
      <div>
        <p v-if="authorName" class="text-sm font-semibold text-default">{{ authorName }}</p>
        <p class="text-sm text-dimmed">More stories and updates from {{ siteName }}</p>
      </div>
      <PlatformButton :to="blogBasePath" variant="outline" size="sm">More Posts</PlatformButton>
    </div>
    </div>

    <div v-if="relatedPosts.length" class="mx-auto mt-16 max-w-4xl border-t border-default pt-10">
      <h2 class="mb-6 text-xl font-bold text-default">More from {{ siteName }}</h2>
      <div class="grid gap-6 sm:grid-cols-2">
        <NuxtLink
          v-for="relatedPost in relatedPosts"
          :key="relatedPost.id"
          :to="`${blogBasePath}/${relatedPost.slug}`"
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
    <PlatformButton :to="blogBasePath" variant="outline" size="sm" class="mt-6">More Posts</PlatformButton>
  </div>

  <PlatformCommandSearchModal surface="tenant_blog" variant="saya" />
</template>

<script setup lang="ts">
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import { structuredComponentsFromBlocks } from '~/utils/blog-editor'
import { resolveSocialImageUrl } from '~/utils/social-metadata'
import { splitLocalePrefix } from '~/utils/tenant-locale-path'
import type { PublicLocaleRepresentation } from '~/utils/public-resource-contracts'

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
  updated_at?: string | null
  featured_order?: number | null
  author?: { id: string; name: string | null; image: string | null } | null
  media?: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string | null; width: number | null; height: number | null }>
  components?: ContentComponent[]
  content_blocks?: import('~/lib/components/workspace/blog/types').BlogEditorBlock[] | null
  localeRepresentations: PublicLocaleRepresentation[]
}

const route = useRoute()
const parsedRoute = splitLocalePrefix(route.path)
const locale = parsedRoute.localeSegment ?? 'en'
useState<string>('public-locale', () => 'en').value = locale
const blogSection = parsedRoute.sourcePath.startsWith('/article/') ? 'article' : 'blog'
const sourceBlogBasePath = `/${blogSection}`
const blogBasePath = locale === 'en' ? sourceBlogBasePath : `/${locale}${sourceBlogBasePath}`
const requestEvent = useRequestEvent()
const postEndpoint = computed(() => `/api/public/sites/${siteId}/blog/${String(route.params.slug)}?locale=${encodeURIComponent(locale)}`)

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
    && Array.isArray(value.post.localeRepresentations)
  ))

const { data, pending, error } = await useAsyncData(
  () => `tenant-blog-post-${siteId}-${locale}-${String(route.params.slug)}`,
  async () => {
    let post: TenantBlogPost | null | undefined

    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

      const [{ cloudflareEnv }, { getPublishedLocalizedSiteBlogPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      post = await getPublishedLocalizedSiteBlogPost(db, siteId, String(route.params.slug), locale, env) as TenantBlogPost | null
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
useState<PublicLocaleRepresentation[]>('public-locale-representations', () => []).value = data.value.post.localeRepresentations

const post = computed(() => data.value?.post ?? null)
const { blogList, config, site: publicSite } = await usePublicPageData()
const allPosts = computed(() => (blogList.value ?? []) as unknown as TenantBlogPost[])
const { categories } = useTenantBlogNav(allPosts)
const relatedPosts = computed(() => allPosts.value.filter(item => item.slug !== post.value?.slug).slice(0, 4))
const siteName = computed(() => locale === 'en'
  ? (publicSite.value?.brand_name?.trim() ?? site?.brand_name?.trim() ?? '')
  : (publicSite.value?.brand_name?.trim() ?? ''))
const authorName = computed(() => post.value?.author?.name ?? null)
const authorImage = computed(() => post.value?.author?.image ?? null)
const readTime = computed(() => {
  const words = (post.value?.content_blocks ?? [])
    .map(block => block.type === 'heading' ? block.data.text : block.data.markdown)
    .filter(value => typeof value === 'string')
    .join(' ')
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
  return post.value?.media?.find(item => item.slot === 'featured') ?? null
})
const postMedia = computed(() => resolveMedia(selectedPostImage.value))
const postImageUrl = computed(() => resolveSocialImageUrl(selectedPostImage.value))

const postPath = computed(() => `${blogBasePath}/${post.value?.slug ?? ''}`)
const requestURL = useRequestURL()
const resolvedSeo = computed(() => resolveBlogSeo({
  title: post.value?.title || 'Blog', seoTitle: post.value?.seo_title, excerpt: post.value?.excerpt,
  seoDescription: post.value?.seo_description, slug: post.value?.slug || '', canonicalUrl: post.value?.canonical_url,
  baseUrl: requestURL.origin, publicPath: postPath.value, siteName: siteName.value,
  robots: post.value?.visibility === 'unlisted' ? 'noindex,follow' : post.value?.robots,
}))

const { canonicalUrl } = useSocialMetadata(() => ({
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
    logoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || null,
    faviconUrl: publicSite.value?.media.find(item => item.slot === 'favicon')?.public_url || null,
    primaryColor: config.value?.brand_color || null,
  },
  ownerMedia: post.value?.media ?? [],
  heroImage: postImageUrl.value ? { url: postImageUrl.value } : null,
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
    imageUrl: postImageUrl.value || undefined,
    imageWidth: selectedPostImage.value?.width ?? undefined,
    imageHeight: selectedPostImage.value?.height ?? undefined,
    datePublished: post.value.published_at,
    dateModified: post.value.updated_at,
    authorName: authorName.value,
    articleSection: post.value.category || undefined,
    keywords: post.value.seo_keywords || undefined,
    inLanguage: locale === 'en' ? 'en-US' : locale,
    breadcrumbs: [
      { name: blogSection === 'article' ? 'Articles' : 'Blog', url: blogBasePath },
      { name: post.value.title, url: postPath.value },
    ],
    components: renderableComponents.value,
    siteName: siteName.value,
    siteLogoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || undefined,
    siteDescription: site?.brand_description || undefined,
  }
}))
</script>
