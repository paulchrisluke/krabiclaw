<template>
  <div>
    <div v-if="isCategoryRedirect" class="py-12 text-center">
      <p class="text-muted">Redirecting...</p>
    </div>

    <div v-else-if="loading" class="py-12 text-center">
      <p class="text-muted">Loading...</p>
    </div>

    <div v-else-if="error || !doc" class="rounded-lg border border-red-200 bg-red-50 p-6">
      <p class="text-red-600">{{ error?.message || 'Documentation not found' }}</p>
    </div>

    <div v-else class="xl:grid xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-10">
      <article>
        <DocsBreadcrumb :crumbs="breadcrumbs" />

        <h1 class="mb-6 text-4xl font-bold text-default">{{ doc.title }}</h1>

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
            <!-- eslint-disable vue/no-v-html -->
            <div
              v-if="block.kind === 'html'"
              class="prose prose-lg max-w-none text-default prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base dark:prose-invert"
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

        <nav v-if="previousDoc || nextDoc" class="mt-16 grid gap-4 border-t border-default pt-8 md:grid-cols-2">
          <NuxtLink
            v-if="previousDoc"
            :to="previousDoc.path"
            class="group rounded-2xl border border-default p-5 no-underline transition hover:border-muted hover:bg-elevated"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Previous</p>
            <p class="mt-2 text-lg font-semibold text-default group-hover:text-primary">{{ previousDoc.title }}</p>
            <p v-if="previousDoc.category" class="mt-1 text-sm text-muted">{{ previousDoc.category }}</p>
          </NuxtLink>
          <div v-else class="hidden md:block" />

          <NuxtLink
            v-if="nextDoc"
            :to="nextDoc.path"
            class="group rounded-2xl border border-default p-5 text-left no-underline transition hover:border-muted hover:bg-elevated md:justify-self-end md:w-full"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Next</p>
            <p class="mt-2 text-lg font-semibold text-default group-hover:text-primary">{{ nextDoc.title }}</p>
            <p v-if="nextDoc.category" class="mt-1 text-sm text-muted">{{ nextDoc.category }}</p>
          </NuxtLink>
        </nav>
      </article>

      <aside class="hidden xl:block">
        <DocsToc :html="tocHtml" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr, stripLeadingTitleHeading } from '~/utils/markdown'
import { useContentPageSchema } from '~/composables/useContentPageSchema'
import { categoryToSlug, slugToCategory } from '~/utils/docs-categories'
import { buildContentBlocks, normalizeContentComponent, type ContentComponent } from '~/utils/content-blocks'
import { resolveContentComponent } from '~/utils/content-component-resolver'

definePageMeta({ layout: 'docs' })

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

interface DocListItem {
  title: string
  slug: string
  category?: string | null
}

const route = useRoute()
const segments = computed(() => {
  const raw = route.params.segments
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.length) {
    return raw.split('/').map(part => part.trim()).filter(Boolean)
  }
  return []
})

const categoryParam = computed(() => segments.value[0] ?? '')
const slugParam = computed(() => segments.value[1] ?? null)
const isCategoryRedirect = computed(() => segments.value.length === 1)

if (segments.value.length < 1 || segments.value.length > 2) {
  throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })
}

if (!slugToCategory(categoryParam.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Documentation category not found' })
}

const { data: docsList, error: docsListError } = await useFetch<{ docs: DocListItem[] }>('/api/public/docs', {
  default: () => ({ docs: [] })
})

if (docsListError.value) {
  throw createError({ statusCode: 500, statusMessage: 'Failed to load documentation index' })
}

if (!slugParam.value) {
  const firstDoc = (docsList.value?.docs ?? []).find(doc => doc.category === slugToCategory(categoryParam.value))
  if (!firstDoc) {
    throw createError({ statusCode: 404, statusMessage: 'Documentation category not found' })
  }
  await navigateTo(`/docs/${categoryParam.value}/${firstDoc.slug}`, { replace: true, redirectCode: 302 })
}

const { data: doc, pending: loading, error } = await useAsyncData(
  `doc-${categoryParam.value}-${slugParam.value ?? 'index'}`,
  async () => {
    if (!slugParam.value) return null

    let doc: Doc | null | undefined

    // Fetch directly against the real request's D1 binding instead of doing a nested
    // self-fetch back to our own API — Nitro's internal dispatch for this two-segment
    // dynamic route doesn't reliably reproduce the same route-param/binding resolution
    // as a real external request, which caused pages/blog/[category]/[slug].vue to 404
    // on posts its own API served correctly. Same fix applied here.
    if (import.meta.server) {
      const category = slugToCategory(categoryParam.value)
      if (!category) throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })

      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })

      const [{ cloudflareEnv }, { getPublishedPlatformDoc }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      doc = await getPublishedPlatformDoc(db, category, slugParam.value) as Doc | null
    } else {
      const endpoint = `/api/public/docs/${categoryParam.value}/${slugParam.value}`
      const response = await $fetch<{ doc?: Doc }>(endpoint)
      doc = response?.doc
    }

    if (!doc) {
      throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })
    }
    return doc
  },
  {
    default: () => null,
  }
)

if (error.value) {
  throw error.value
}

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const contentBlocks = computed(() =>
  buildContentBlocks(stripLeadingTitleHeading(doc.value?.body ?? '', doc.value?.title), doc.value?.components ?? [], renderMarkdown),
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

const orderedDocs = computed(() => (docsList.value?.docs ?? [])
  .map((item) => {
    const itemCategorySlug = categoryToSlug(item.category)
    if (!itemCategorySlug) return null
    return {
      ...item,
      path: `/docs/${itemCategorySlug}/${item.slug}`,
    }
  })
  .filter((item): item is DocListItem & { path: string } => Boolean(item)))

const categoryDocs = computed(() =>
  orderedDocs.value.filter(item => item.category === doc.value?.category),
)

const currentDocIndex = computed(() =>
  categoryDocs.value.findIndex(item =>
    item.slug === doc.value?.slug && item.category === doc.value?.category,
  ),
)

const previousDoc = computed(() =>
  currentDocIndex.value > 0 ? categoryDocs.value[currentDocIndex.value - 1] : null,
)

const nextDoc = computed(() =>
  currentDocIndex.value >= 0 && currentDocIndex.value < categoryDocs.value.length - 1
    ? categoryDocs.value[currentDocIndex.value + 1]
    : null,
)

const docMedia = computed(() => resolveMedia({
  public_url: doc.value?.featured_image?.public_url,
  kind: doc.value?.featured_image?.kind,
}))

const categorySlug = computed(() => categoryToSlug(doc.value?.category) || categoryParam.value)
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
