<template>
  <div>
    <div v-if="loading" class="py-12 text-center">
      <p class="text-muted">Loading...</p>
    </div>

    <div v-else-if="error || !doc" class="rounded-lg border border-red-200 bg-red-50 p-6">
      <p class="text-red-600">{{ error?.message || 'Documentation not found' }}</p>
    </div>

    <div v-else class="xl:grid xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-10">
    <article>
      <DocsBreadcrumb :crumbs="breadcrumbs" />

      <h1 class="mb-6 text-4xl font-bold text-default">{{ doc.title }}</h1>

      <p v-if="doc.excerpt" class="mb-8 text-xl leading-relaxed text-muted">{{ doc.excerpt }}</p>

      <div v-if="docMedia.url" class="mb-10 overflow-hidden rounded-2xl">
        <video
          v-if="docMedia.isVideo"
          :src="docMedia.url"
          autoplay
          muted
          loop
          playsinline
          class="max-h-96 w-full object-cover"
        />
        <img
          v-else
          :src="docMedia.url"
          :alt="doc.title"
          class="max-h-96 w-full object-cover"
        />
      </div>

      <div ref="articleBodyRef" class="space-y-14">
        <template v-for="(block, blockIndex) in renderedBlocks" :key="`block-${blockIndex}`">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div
            v-if="block.kind === 'html'"
            class="prose prose-lg max-w-none text-default prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base dark:prose-invert"
            v-html="block.html"
          />

          <component
            :is="resolveContentComponent(block.type)"
            v-else
            v-bind="block.props"
          />
        </template>
      </div>
    </article>

    <aside class="hidden xl:block">
      <DocsToc :html="tocHtml" />
    </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { useContentPageSchema } from '~/composables/useContentPageSchema'
import { categoryToSlug } from '~/utils/docs-categories'
import { buildContentBlocks, normalizeContentComponent, type ContentComponent } from '~/utils/content-blocks'
import { resolveContentComponent } from '~/utils/content-component-resolver'

definePageMeta({ layout: 'docs' })

// isomorphic-dompurify's jsdom shim breaks during SSR on the Workers runtime
// (no real DOM globals) — load it client-only, matching pages/experiences/[slug].vue.
// The SSR path uses a Workers-safe regex sanitizer instead of a no-op passthrough.
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }

const { resolveMedia } = useMedia()

interface Doc {
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
  difficulty_level?: string | null
  featured_image_asset_id?: string | null
  published_at?: string | null
  updated_at?: string | null
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
const requestFetch = useRequestFetch()

const { data: doc, pending: loading, error } = await useAsyncData(
  `doc-${route.params.category}-${route.params.slug}`,
  async () => {
    const response = import.meta.server
      ? await requestFetch<{ doc?: Doc }>(`/api/public/docs/${route.params.category}/${route.params.slug}`)
      : await $fetch<{ doc?: Doc }>(`/api/public/docs/${route.params.category}/${route.params.slug}`)
    if (!response?.doc) {
      throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })
    }
    return response.doc
  }
)

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const contentBlocks = computed(() =>
  buildContentBlocks(doc.value?.body ?? '', doc.value?.components ?? [], renderMarkdown),
)
const hasExplicitEmbeds = computed(() => /\{\{\s*component\s+type\s*=/.test(doc.value?.body ?? ''))
const tocHtml = computed(() => contentBlocks.value
  .filter(block => block.kind === 'html')
  .map(block => block.html)
  .join('\n'))

const articleBodyRef = ref<HTMLElement | null>(null)
useCopyableCodeBlocks(articleBodyRef, contentBlocks)
const renderedBlocks = computed(() => {
  if (hasExplicitEmbeds.value) return contentBlocks.value

  const fallbackBlocks = (doc.value?.components ?? [])
    .map(component => normalizeContentComponent(component, renderMarkdown))
    .filter((component): component is NonNullable<typeof component> => Boolean(component))
    .map(component => ({ kind: 'component' as const, type: component.type, props: component.props, component: component.source }))

  return [...contentBlocks.value, ...fallbackBlocks]
})
const renderedComponents = computed(() => {
  const fallbackBlocks = hasExplicitEmbeds.value
    ? []
    : (doc.value?.components ?? [])
      .map(component => normalizeContentComponent(component, renderMarkdown))
      .filter((component): component is NonNullable<typeof component> => Boolean(component))
      .map(component => ({ kind: 'component' as const, type: component.type, props: component.props, component: component.source }))

  return [
    ...contentBlocks.value,
    ...fallbackBlocks,
  ].filter((block): block is Extract<typeof block, { kind: 'component' }> => block.kind === 'component')
    .map(block => block.component)
})

const docMedia = computed(() => resolveMedia({
  public_url: doc.value?.featured_image?.public_url,
  kind: doc.value?.featured_image?.kind,
}))

const categorySlug = computed(() => categoryToSlug(doc.value?.category) || String(route.params.category))
const canonicalUrl = usePlatformSeoUrl(() => doc.value ? (doc.value.canonical_url || `/docs/${categorySlug.value}/${doc.value.slug}`) : '/docs')
const ogImage = useSharedOgImage(() => docMedia.value.thumb)
const seoTitle = computed(() => doc.value?.title || 'Documentation')
const seoDescription = computed(() => doc.value?.seo_description || doc.value?.excerpt || `Learn about ${doc.value?.title || 'this topic'} in KrabiClaw documentation.`)

const breadcrumbs = computed(() => [
  { name: 'Docs', url: '/docs' },
  ...(doc.value?.category ? [{ name: doc.value.category, url: `/docs/${categorySlug.value}` }] : []),
  ...(doc.value ? [{ name: doc.value.title, url: `/docs/${categorySlug.value}/${doc.value.slug}` }] : []),
])

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogImage,
  twitterImage: ogImage,
  ogUrl: canonicalUrl,
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  meta: [
    ...(doc.value?.seo_keywords?.trim() ? [{ name: 'keywords', content: doc.value.seo_keywords.trim() }] : []),
    ...(doc.value?.robots?.trim() ? [{ name: 'robots', content: doc.value.robots.trim() }] : []),
  ],
}))

useContentPageSchema(computed(() => {
  if (!doc.value) return null
  return {
    articleType: 'TechArticle' as const,
    url: canonicalUrl.value,
    title: doc.value.title,
    description: seoDescription.value,
    imageUrl: docMedia.value.url || undefined,
    imageWidth: doc.value.featured_image?.width ?? undefined,
    imageHeight: doc.value.featured_image?.height ?? undefined,
    datePublished: doc.value.published_at,
    dateModified: doc.value.updated_at,
    authorName: 'KrabiClaw',
    articleSection: doc.value.category || undefined,
    keywords: doc.value.seo_keywords || undefined,
    inLanguage: 'en-US',
    proficiencyLevel: doc.value.difficulty_level || undefined,
    breadcrumbs: breadcrumbs.value,
    components: renderedComponents.value,
  }
}))
</script>
