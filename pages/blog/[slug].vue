<template>
  <div v-if="pending" class="mx-auto max-w-3xl space-y-4 px-4 py-16 sm:px-6 lg:px-8">
    <div class="h-6 w-1/4 animate-pulse rounded bg-elevated" />
    <div class="h-12 w-3/4 animate-pulse rounded bg-elevated" />
    <div class="mt-8 space-y-3">
      <div v-for="i in 10" :key="i" class="h-4 animate-pulse rounded bg-elevated" :style="`width: ${70 + (i % 3) * 10}%`" />
    </div>
  </div>

  <div v-else-if="error || !post" class="py-24 text-center">
    <p class="mb-6 text-xl text-muted">Post not found.</p>
    <UButton to="/blog" variant="outline" color="neutral">Back to Blog</UButton>
  </div>

  <article v-else class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <span v-if="post.category" class="rounded bg-muted px-2 py-1 text-xs font-medium text-muted">
        {{ post.category }}
      </span>
      <span v-if="post.published_at" class="text-sm text-dimmed">
        <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
      </span>
    </div>

    <h1 class="mb-5 text-4xl font-bold leading-tight text-default">{{ post.title }}</h1>
    <p v-if="post.excerpt" class="mb-8 text-xl leading-relaxed text-muted">{{ post.excerpt }}</p>

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
      <template v-for="(block, blockIndex) in contentBlocks" :key="`block-${blockIndex}`">
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

    <div class="mt-16 border-t border-default pt-8">
      <UButton to="/blog" variant="outline" color="neutral" size="sm">More Posts</UButton>
    </div>
  </article>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { buildContentBlocks, normalizeContentComponent, type ContentComponent } from '~/utils/content-blocks'
import { resolveContentComponent } from '~/utils/content-component-resolver'

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }

const { isTenant, siteId, site } = useTenantSite()
if (!isTenant || !siteId) throw createError({ statusCode: 404 })

definePageMeta({ layout: 'saya' })

const { resolveMedia } = useMedia()
const route = useRoute()
const requestFetch = useRequestFetch()

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
  updated_at?: string | null
  featured_image?: { public_url: string | null; kind: string | null; width: number | null; height: number | null } | null
  components?: ContentComponent[]
}

const postEndpoint = computed(() => `/api/public/sites/${siteId}/blog/${String(route.params.slug)}`)

function getErrorStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined
  const statusCode = (error as { statusCode?: unknown }).statusCode
  if (typeof statusCode === 'number') return statusCode
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

const { data, pending, error } = await useAsyncData(
  () => `tenant-blog-post-${postEndpoint.value}`,
  async () => {
    let payload: { post?: TenantBlogPost }
    try {
      payload = import.meta.server
        ? await requestFetch<{ post?: TenantBlogPost }>(postEndpoint.value)
        : await $fetch<{ post?: TenantBlogPost }>(postEndpoint.value)
    } catch (err) {
      if (getErrorStatusCode(err) === 404) throw err
      throw err
    }

    if (!payload.post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

    return { post: payload.post }
  },
)

if (error.value && getErrorStatusCode(error.value) !== 404) throw error.value

const post = computed(() => data.value?.post ?? null)
const siteName = computed(() => site?.brand_name || 'Our Site')

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const renderableComponents = computed(() =>
  (post.value?.components ?? [])
    .map(component => normalizeContentComponent(component, renderMarkdown))
    .filter((component): component is NonNullable<ReturnType<typeof normalizeContentComponent>> => Boolean(component))
    .map(component => component.source),
)

const contentBlocks = computed(() =>
  buildContentBlocks(post.value?.body ?? '', renderableComponents.value, renderMarkdown),
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
    authorName: siteName.value,
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
