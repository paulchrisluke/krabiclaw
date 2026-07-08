<template>
  <div v-if="pending" class="mx-auto max-w-3xl space-y-4 px-4 py-16 sm:px-6 lg:px-8">
    <div class="h-6 w-1/4 animate-pulse rounded bg-elevated" />
    <div class="h-12 w-3/4 animate-pulse rounded bg-elevated" />
    <div class="mt-8 space-y-3">
      <div v-for="i in 10" :key="i" class="h-4 animate-pulse rounded bg-elevated" :style="`width: ${70 + (i % 3) * 10}%`" />
    </div>
  </div>

  <article v-else-if="post" class="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <span v-if="post.category" class="rounded bg-muted px-2 py-1 text-xs font-medium text-muted">
        {{ post.category }}
      </span>
      <span v-if="post.published_at" class="text-sm text-dimmed">
        <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
      </span>
      <span class="text-sm text-dimmed">{{ readTime }} min read</span>
      <span v-if="wasUpdated && post.updated_at" class="text-sm text-dimmed">
        Updated <NuxtTime :datetime="post.updated_at" locale="en-US" month="long" day="numeric" time-zone="UTC" />
      </span>
    </div>

    <h1 class="mb-5 text-4xl font-bold leading-tight text-default">{{ post.title }}</h1>
    <p v-if="post.excerpt" class="mb-8 text-xl leading-relaxed text-muted">{{ post.excerpt }}</p>

    <div class="mb-8 flex items-center gap-4 border-y border-default py-4">
      <div
        class="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white"
        style="background-color: var(--ui-primary)"
      >
        {{ authorInitial }}
      </div>
      <div>
        <p class="font-semibold text-default">{{ authorName }}</p>
        <p class="text-sm text-dimmed">Published from {{ siteName }}</p>
      </div>
    </div>

    <div v-if="postMedia.url" class="relative mb-10 h-64 w-full overflow-hidden rounded-2xl md:h-96">
      <video
        v-if="postMedia.isVideo"
        :src="postMedia.url"
        autoplay
        muted
        loop
        playsinline
        class="h-full w-full object-cover"
      />
      <img
        v-else
        :src="postMedia.url"
        :alt="post.title"
        class="h-full w-full object-cover"
      />
    </div>

    <div class="space-y-14">
      <template v-for="(block, blockIndex) in renderedBlocks" :key="`block-${blockIndex}`">
        <!-- eslint-disable vue/no-v-html -->
        <div
          v-if="block.kind === 'html'"
          class="prose prose-lg max-w-none
                 prose-headings:text-default prose-headings:font-bold
                 prose-p:leading-relaxed prose-p:text-muted
                 prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                 prose-strong:text-default prose-li:text-muted
                 dark:prose-invert"
          v-html="block.html"
        />
        <!-- eslint-enable vue/no-v-html -->
        <component :is="resolveContentComponent(block.type)" v-else v-bind="block.props" />
      </template>
    </div>

    <div class="mt-16 flex items-center justify-between gap-6 border-t border-default pt-8">
      <div>
        <p class="text-sm font-semibold text-default">{{ authorName }}</p>
        <p class="text-sm text-dimmed">More stories and updates from {{ siteName }}</p>
      </div>
      <PlatformButton to="/blog" variant="outline" size="sm">More Posts</PlatformButton>
    </div>
  </article>

  <div v-else class="mx-auto max-w-3xl px-4 py-32 text-center">
    <h1 class="text-2xl font-bold text-default">Post not found</h1>
    <p class="mt-3 text-muted">This post may have been moved or removed.</p>
    <PlatformButton to="/blog" variant="outline" size="sm" class="mt-6">More Posts</PlatformButton>
  </div>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr, stripLeadingTitleHeading } from '~/utils/markdown'
import { buildContentBlocks, normalizeContentComponent, type ContentComponent } from '~/utils/content-blocks'
import { resolveContentComponent } from '~/utils/content-component-resolver'

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }

const { isTenant, siteId, site } = useTenantSite()
if (!isTenant || !siteId) throw createError({ statusCode: 404 })

definePageMeta({ layout: 'saya' })

const { resolveMedia } = useMedia()

interface TenantBlogPost {
  id: string
  title: string
  slug: string
  body: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  published_at?: string | null
  author_name?: string | null
  updated_at?: string | null
  featured_image?: { public_url: string | null; kind: string | null; width: number | null; height: number | null } | null
  components?: ContentComponent[]
}

const route = useRoute()
const postEndpoint = computed(() => `/api/public/sites/${siteId}/blog/${String(route.params.slug)}`)

interface BootstrapBlogResponse {
  post: TenantBlogPost | null
}

const { data, pending, error } = await useAsyncData(
  () => `tenant-blog-post-${siteId}-${String(route.params.slug)}`,
  async () => {
    let post: TenantBlogPost | null | undefined

    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

      const [{ cloudflareEnv }, { getPublishedSiteBlogPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      post = await getPublishedSiteBlogPost(db, siteId, String(route.params.slug)) as TenantBlogPost | null
    } else {
      let payload: BootstrapBlogResponse
      try {
        payload = await $fetch<BootstrapBlogResponse>(postEndpoint.value)
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

const post = computed(() => data.value?.post ?? null)
const siteName = computed(() => site?.brand_name || 'Our Site')
const authorName = computed(() => post.value?.author_name?.trim() || siteName.value)
const authorInitial = computed(() => authorName.value.charAt(0).toUpperCase())
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

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const hasExplicitEmbeds = computed(() => /\{\{\s*component\s+type\s*=/.test(post.value?.body ?? ''))
const renderedBlocks = computed(() => {
  const blocks = buildContentBlocks(stripLeadingTitleHeading(post.value?.body ?? '', post.value?.title), post.value?.components ?? [], renderMarkdown)
  if (hasExplicitEmbeds.value) return blocks

  const fallbackBlocks = (post.value?.components ?? [])
    .map(component => normalizeContentComponent(component, renderMarkdown))
    .filter((component): component is NonNullable<ReturnType<typeof normalizeContentComponent>> => Boolean(component))
    .map(component => ({ kind: 'component' as const, type: component.type, props: component.props, component: component.source }))

  return [...blocks, ...fallbackBlocks]
})

const renderableComponents = computed(() =>
  renderedBlocks.value
    .filter((block): block is Extract<typeof block, { kind: 'component' }> => block.kind === 'component')
    .map(block => block.component),
)

const postMedia = computed(() => resolveMedia({
  public_url: post.value?.featured_image?.public_url,
  kind: post.value?.featured_image?.kind,
}))

const postPath = computed(() => `/blog/${post.value?.slug ?? ''}`)
const canonicalUrl = useSeoUrl(() => post.value ? (post.value.canonical_url || postPath.value) : '/blog')
const ogImage = useTenantOgImage(() => postMedia.value.thumb)
const seoTitle = computed(() => post.value ? `${post.value.title} | ${siteName.value}` : 'Blog')
const seoDescription = computed(() => post.value?.seo_description || post.value?.excerpt || `A post from ${siteName.value}.`)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: siteName,
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  ogUrl: canonicalUrl,
  ogType: 'article',
  ogImage,
  twitterImage: ogImage,
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  meta: [
    ...(post.value?.seo_keywords?.trim() ? [{ name: 'keywords', content: post.value.seo_keywords.trim() }] : []),
    ...(post.value?.robots?.trim() ? [{ name: 'robots', content: post.value.robots.trim() }] : []),
  ],
}))

useContentPageSchema(computed(() => {
  if (!post.value) return null
  return {
    articleType: 'BlogPosting' as const,
    url: canonicalUrl.value,
    title: post.value.title,
    description: seoDescription.value,
    imageUrl: postMedia.value.url || undefined,
    imageWidth: post.value.featured_image?.width ?? undefined,
    imageHeight: post.value.featured_image?.height ?? undefined,
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
