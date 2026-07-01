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

      <div class="mb-6 flex flex-wrap items-center gap-3">
        <span v-if="post.category" class="rounded-full px-3 py-1 text-sm font-medium" :class="blogCategoryClass(post.category)">
          {{ post.category }}
        </span>
        <span v-if="post.published_at" class="text-sm text-dimmed">
          <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
        </span>
        <span class="text-sm text-dimmed">·</span>
        <span class="text-sm text-dimmed">{{ readTime }} min read</span>
      </div>

      <h1 class="mb-5 text-4xl font-bold leading-tight text-default">{{ post.title }}</h1>
      <p v-if="post.excerpt" class="mb-8 text-xl leading-relaxed text-muted">{{ post.excerpt }}</p>

      <div class="mb-10 flex items-center gap-4 border-y border-default py-6">
        <div class="shrink-0">
          <img
            v-if="post.author_image"
            :src="post.author_image"
            :alt="post.author_name || 'Author avatar'"
            class="h-12 w-12 rounded-full object-cover"
          />
          <div
            v-else
            class="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
            style="background-color: var(--kc-teal)"
          >
            {{ authorInitial }}
          </div>
        </div>
        <div>
          <p class="font-semibold text-default">{{ post.author_name || 'KrabiClaw' }}</p>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dimmed">
            <span v-if="post.published_at">
              Published <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
            </span>
            <span v-if="wasUpdated && post.updated_at">
              · Updated <NuxtTime :datetime="post.updated_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
            </span>
          </div>
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
      <div v-else class="mb-10 h-64 rounded-2xl bg-muted" aria-hidden="true" />

      <div ref="articleBodyRef" class="space-y-14">
        <template v-for="(block, blockIndex) in renderedBlocks" :key="`block-${blockIndex}`">
          <!-- eslint-disable vue/no-v-html -->
          <div
            v-if="block.kind === 'html'"
            class="prose prose-lg max-w-none
                   prose-headings:text-default prose-headings:font-bold
                   prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base
                   prose-p:leading-relaxed prose-p:text-muted
                   prose-a:text-(--kc-teal) prose-a:no-underline hover:prose-a:underline
                   prose-strong:text-default
                   prose-li:text-muted
                   prose-hr:border-default
                   prose-blockquote:border-l-(--kc-teal) prose-blockquote:text-muted
                   dark:prose-invert"
            v-html="block.html"
          />
          <!-- eslint-enable vue/no-v-html -->

          <component
            :is="resolveContentComponent(block.type)"
            v-else
            v-bind="block.props"
          />
        </template>
      </div>

      <div class="mt-16 flex items-center justify-between gap-6 border-t border-default pt-8">
        <div class="flex items-center gap-4">
          <div class="shrink-0">
            <img
              v-if="post.author_image"
              :src="post.author_image"
              :alt="post.author_name || 'Author avatar'"
              class="h-10 w-10 rounded-full object-cover"
            />
            <div
              v-else
              class="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
              style="background-color: var(--kc-teal)"
            >
              {{ authorInitial }}
            </div>
          </div>
          <div>
            <p class="text-sm font-semibold text-default">{{ post.author_name || 'KrabiClaw' }}</p>
            <p v-if="authorSubtitle" class="text-xs text-dimmed">{{ authorSubtitle }}</p>
          </div>
        </div>
        <UButton to="/blog" variant="outline" color="neutral" size="sm">More Articles</UButton>
      </div>
    </article>

    <aside class="hidden xl:block">
      <DocsToc :html="tocHtml" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { useContentPageSchema } from '~/composables/useContentPageSchema'
import { blogCategoryClass, blogCategoryToSlug, getBlogPostPath, slugToBlogCategory } from '~/utils/blog-categories'
import { buildContentBlocks, normalizeContentComponent, type ContentComponent } from '~/utils/content-blocks'
import { resolveContentComponent } from '~/utils/content-component-resolver'

const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }

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
  seo_keywords?: string | null
  canonical_url?: string | null
  robots?: string | null
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  author_name?: string | null
  author_image?: string | null
  author_subtitle?: string | null
  author_bio?: string | null
  featured_image?: {
    asset_id: string | null
    public_url: string | null
    kind: string | null
    width: number | null
    height: number | null
  } | null
  components?: ContentComponent[]
}

const route = useRoute()
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

      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Article not found' })

      const [{ cloudflareEnv }, { getPublishedPlatformBlogPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      post = await getPublishedPlatformBlogPost(db, category, String(route.params.slug)) as BlogPost | null
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
    return {
      post: {
        ...post,
        author_subtitle: post.author_subtitle || post.author_bio || '',
      },
    }
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
const authorSubtitle = computed(() => post.value?.author_subtitle || '')

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
const tocHtml = computed(() => renderedBlocks.value
  .filter(block => block.kind === 'html')
  .map(block => block.html)
  .join('\n'))

const articleBodyRef = ref<HTMLElement | null>(null)
useCopyableCodeBlocks(articleBodyRef, renderedBlocks)
const renderableComponents = computed(() =>
  renderedBlocks.value
    .filter((block): block is Extract<typeof block, { kind: 'component' }> => block.kind === 'component')
    .map(block => block.component),
)

const readTime = computed(() => {
  const words = (post.value?.body ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
})

const authorInitial = computed(() => {
  const name = post.value?.author_name ?? ''
  return name ? name.charAt(0).toUpperCase() : 'K'
})

const wasUpdated = computed(() => {
  if (!post.value?.updated_at || !post.value?.published_at) return false
  const updatedDate = new Date(post.value.updated_at)
  const publishedDate = new Date(post.value.published_at)
  if (Number.isNaN(updatedDate.getTime()) || Number.isNaN(publishedDate.getTime())) return false
  return Math.abs(updatedDate.getTime() - publishedDate.getTime()) > 60_000
})

const postMedia = computed(() => resolveMedia({
  public_url: post.value?.featured_image?.public_url,
  kind: post.value?.featured_image?.kind,
}))

const categorySlug = computed(() => blogCategoryToSlug(post.value?.category) || String(route.params.category))
const postPath = computed(() => getBlogPostPath(post.value?.category, post.value?.slug) || '/blog')
const breadcrumbs = computed(() => [
  { name: 'Blog', url: '/blog' },
  ...(post.value?.category ? [{ name: post.value.category, url: `/blog#${categorySlug.value}` }] : []),
  ...(post.value ? [{ name: post.value.title, url: postPath.value }] : []),
])

const canonicalUrl = usePlatformSeoUrl(() => post.value ? (post.value.canonical_url || postPath.value) : '/blog')
const ogImage = useSharedOgImage(() => postMedia.value.thumb)
const seoTitle = computed(() => post.value?.title || 'Blog')
const seoDescription = computed(() => post.value?.seo_description || truncateForSeo(post.value?.excerpt ?? 'Business tips and insights from KrabiClaw.', 160))

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: 'KrabiClaw',
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
    authorName: post.value.author_name || 'KrabiClaw',
    articleSection: post.value.category || undefined,
    keywords: post.value.seo_keywords || undefined,
    inLanguage: 'en-US',
    breadcrumbs: breadcrumbs.value,
    components: renderableComponents.value,
  }
}))
</script>
