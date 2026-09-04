<template>
  <div v-if="pending" class="space-y-4">
    <div class="h-6 w-1/4 animate-pulse rounded bg-elevated" />
    <div class="h-12 w-3/4 animate-pulse rounded bg-elevated" />
    <div class="h-12 w-1/2 animate-pulse rounded bg-elevated" />
    <div class="mt-4 h-5 w-2/3 animate-pulse rounded bg-elevated" />
    <div class="mt-8 space-y-3">
      <div v-for="i in 10" :key="i" class="h-4 animate-pulse rounded bg-elevated" :style="`width: ${70 + (i % 3) * 10}%`" />
    </div>
  </div>

  <div v-else-if="post" class="xl:grid xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-10">
    <article>
      <DocsBreadcrumb :crumbs="breadcrumbs" />

      <BlogArticleView :title="post.title" :excerpt="post.excerpt" :category="post.category" :published-at="post.published_at" :updated-at="wasUpdated ? post.updated_at : null" :author-name="authorName" :author-image="authorImage" site-name="KrabiClaw" :media-url="postMedia.url" :media-kind="postMedia.isVideo ? 'video' : 'image'" :read-minutes="readTime" :blocks="post.content_blocks" template="platform" />

      <div class="mt-16 flex items-center justify-between gap-6 border-t border-default pt-8">
        <div class="flex items-center gap-4">
          <div v-if="post.author" class="shrink-0">
            <img v-if="post.author.image" :src="post.author.image" :alt="post.author.name" class="size-10 rounded-full object-cover">
            <div
              v-else
              class="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
              style="background-color: var(--kc-teal)"
            >
              {{ authorInitial }}
            </div>
          </div>
          <p v-if="post.author" class="text-sm font-semibold text-default">{{ post.author.name }}</p>
        </div>
        <PlatformButton to="/blog" variant="outline" size="sm">More Articles</PlatformButton>
      </div>
    </article>

    <aside class="hidden xl:block">
      <DocsToc :html="tocHtml" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { $fetch } from 'ofetch'
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { useContentPageSchema } from '~/composables/useContentPageSchema'
import { blogCategoryToSlug, getBlogPostPath, slugToBlogCategory } from '~/utils/blog-categories'
import { structuredComponentsFromBlocks } from '~/utils/blog-editor'
import { resolveSocialImageUrl } from '~/utils/social-metadata'
import type { ContentComponent } from '~/utils/content-blocks'
import { loadDomPurify } from '~/utils/dom-purify-loader'

const DOMPurify = import.meta.client ? await loadDomPurify() : { sanitize: sanitizeHtmlForSsr }

const { resolveMedia } = useMedia()

definePageMeta({ layout: 'blog' })

interface BlogPost {
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
  created_at?: string | null
  updated_at?: string | null
  author: { id: string; name: string; image: string | null } | null
  media?: Array<{
    asset_id: string
    slot: string
    public_url: string | null
    thumbnail_url: string | null
    kind: string | null
    width: number | null
    height: number | null
  }>
  components?: ContentComponent[]
  content_blocks?: import('~/lib/components/workspace/blog/types').BlogEditorBlock[] | null
}

const route = useRoute()
const requestEvent = useRequestEvent()
const postEndpoint = computed(() => `/api/public/blog/${String(route.params.category)}/${String(route.params.slug)}`)

const { data, pending, error } = await useAsyncData(
  () => `blog-post-${postEndpoint.value}`,
  async () => {
    let post: BlogPost | null | undefined

    // Fetch directly against the real request's D1 binding instead of doing a
    // nested self-fetch back to our own API — Nitro's internal dispatch for
    // this two-segment dynamic route doesn't reliably reproduce the same
    // route-param/binding resolution as a real external request, which was
    // causing this page to 404 on posts the API itself served correctly.
    if (import.meta.server) {
      const category = slugToBlogCategory(String(route.params.category))
      if (!category) throw createError({ statusCode: 404, statusMessage: 'Article not found' })

      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Article not found' })

      const [{ cloudflareEnv }, { getPublishedPlatformBlogPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      post = await getPublishedPlatformBlogPost(db, category, String(route.params.slug), env) as BlogPost | null
    } else {
      let payload: { post?: BlogPost }
      try {
        payload = await $fetch<{ post?: BlogPost }>(postEndpoint.value)
      } catch (err) {
        const statusCode = typeof err === 'object' && err !== null
          ? Number((err as { statusCode?: unknown; status?: unknown }).statusCode ?? (err as { status?: unknown }).status)
          : undefined
        if (statusCode === 404) {
          throw createError({ statusCode: 404, statusMessage: 'Article not found' })
        }
        throw err
      }
      post = payload.post
    }

    if (!post) {
      throw createError({ statusCode: 404, statusMessage: 'Article not found' })
    }
    return { post }
  }
)

if (error.value) throw error.value

// Watch for errors during client-side navigation
watch(error, (newError) => {
  if (newError) {
    throw newError
  }
})

const post = computed(() => data.value?.post ?? null)
if (!Array.isArray(post.value?.content_blocks) || post.value.content_blocks.length === 0) {
  throw createError({ statusCode: 500, statusMessage: 'Published blog content is missing its canonical blocks' })
}
const authorName = computed(() => post.value?.author?.name ?? null)
const authorImage = computed(() => post.value?.author?.image ?? null)

const tocHtml = computed(() => (post.value?.content_blocks ?? [])
  .filter(block => block.type === 'markdown')
  .map(block => DOMPurify.sanitize(renderMarkdownToHtml(String(block.data.markdown || ''))))
  .join('\n'))

const renderableComponents = computed(() =>
  structuredComponentsFromBlocks(post.value?.content_blocks ?? []),
)

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

const authorInitial = computed(() => authorName.value?.trim().charAt(0).toUpperCase() || '')

const wasUpdated = computed(() => {
  if (!post.value?.updated_at || !post.value?.published_at) return false
  const updatedDate = new Date(post.value.updated_at)
  const publishedDate = new Date(post.value.published_at)
  if (Number.isNaN(updatedDate.getTime()) || Number.isNaN(publishedDate.getTime())) return false
  return Math.abs(updatedDate.getTime() - publishedDate.getTime()) > 60_000
})

const selectedPostImage = computed(() => {
  return post.value?.media?.find(item => item.slot === 'featured') ?? null
})
const postMedia = computed(() => resolveMedia(selectedPostImage.value))
const postImageUrl = computed(() => resolveSocialImageUrl(selectedPostImage.value))

const categorySlug = computed(() => blogCategoryToSlug(post.value?.category) || String(route.params.category))
const postPath = computed(() => getBlogPostPath(post.value?.category, post.value?.slug) || '/blog')
const breadcrumbs = computed(() => [
  { name: 'Blog', url: '/blog' },
  ...(post.value?.category ? [{ name: post.value.category, url: `/blog#${categorySlug.value}` }] : []),
  ...(post.value ? [{ name: post.value.title, url: postPath.value }] : []),
])

// This page emits its content-specific schema.org graph separately.
const runtimeConfig = useRuntimeConfig()
const requestURL = useRequestURL()
const platformOrigin = computed(() => runtimeConfig.public.siteUrl || requestURL.origin)
const resolvedSeo = computed(() => resolveBlogSeo({
  title: post.value?.title || 'Blog', seoTitle: post.value?.seo_title, excerpt: post.value?.excerpt,
  seoDescription: post.value?.seo_description, slug: post.value?.slug || '', canonicalUrl: post.value?.canonical_url,
  baseUrl: platformOrigin.value, publicPath: postPath.value, siteName: 'KrabiClaw',
  robots: post.value?.visibility === 'unlisted' ? 'noindex,follow' : post.value?.robots,
}))
const { canonicalUrl } = useSocialMetadata(() => ({
  template: 'platform' as const,
  schema: false,
  pageType: 'article' as const,
  title: resolvedSeo.value.title,
  description: resolvedSeo.value.description,
  path: resolvedSeo.value.canonicalUrl,
  brand: { siteName: 'KrabiClaw' },
  author: authorName.value,
  publishedAt: post.value?.published_at || null,
  robots: resolvedSeo.value.robots,
  indexable: post.value?.visibility !== 'unlisted' && (!post.value?.robots || !/noindex/i.test(post.value.robots)),
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
    inLanguage: 'en-US',
    breadcrumbs: breadcrumbs.value,
    components: renderableComponents.value,
  }
}))
</script>
