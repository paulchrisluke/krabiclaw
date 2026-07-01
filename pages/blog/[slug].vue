<template>
  <div v-if="pending" class="mx-auto max-w-3xl space-y-4 px-4 py-16 sm:px-6 lg:px-8">
    <div class="h-6 w-1/4 animate-pulse rounded bg-elevated" />
    <div class="h-12 w-3/4 animate-pulse rounded bg-elevated" />
    <div class="mt-8 space-y-3">
      <div v-for="i in 10" :key="i" class="h-4 animate-pulse rounded bg-elevated" :style="`width: ${70 + (i % 3) * 10}%`" />
    </div>
  </div>

  <article v-else-if="post" class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
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

    <div class="mt-16 border-t border-default pt-8">
      <UButton to="/blog" variant="outline" color="neutral" size="sm">More Posts</UButton>
    </div>
  </article>

  <div v-else class="mx-auto max-w-3xl px-4 py-32 text-center">
    <h1 class="text-2xl font-bold text-default">Post not found</h1>
    <p class="mt-3 text-muted">This post may have been moved or removed.</p>
    <UButton to="/blog" variant="outline" color="neutral" size="sm" class="mt-6">More Posts</UButton>
  </div>
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

// Post ships in the layout's single bootstrap payload (page=blog, blogSlug=slug) —
// no separate fetch. useBootstrap() itself is lazy/non-blocking (fine for the
// layout's header/footer), but a missing post here must produce a real HTTP 404
// for search engines, which requires blocking on the fetch during SSR — so this
// page awaits its own useAsyncData call against the exact same key/URL the
// layout uses, and Nuxt's key-based dedup collapses both to one request.
const params = useBootstrapParams()
const bootstrapKey = computed(() => useBootstrapKey(siteId, params.value))
const bootstrapUrl = computed(() => useBootstrapUrl(siteId, params.value))
const requestFetch = useRequestFetch()

interface BootstrapBlogResponse {
  blogPost: TenantBlogPost | null
}

const { data, pending } = await useAsyncData<BootstrapBlogResponse>(
  bootstrapKey,
  () => (import.meta.server
    ? requestFetch<BootstrapBlogResponse>(bootstrapUrl.value)
    : $fetch<BootstrapBlogResponse>(bootstrapUrl.value)),
  {
    getCachedData(k, nuxtApp) {
      return nuxtApp.payload.data[k] as BootstrapBlogResponse | undefined
    },
  },
)

if (!data.value?.blogPost) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true })
}

const post = computed(() => data.value?.blogPost ?? null)
const siteName = computed(() => site?.brand_name || 'Our Site')

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const hasExplicitEmbeds = computed(() => /\{\{\s*component\s+type\s*=/.test(post.value?.body ?? ''))
const renderedBlocks = computed(() => {
  const blocks = buildContentBlocks(post.value?.body ?? '', post.value?.components ?? [], renderMarkdown)
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
