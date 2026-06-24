<template>
  <div class="container mx-auto px-4 py-16">
    <div class="mx-auto max-w-3xl">
      <NuxtLink to="/docs" class="mb-6 inline-flex items-center text-primary hover:text-primary">
        ← Back to Documentation
      </NuxtLink>

      <div v-if="loading" class="py-12 text-center">
        <p class="text-muted">Loading...</p>
      </div>

      <div v-else-if="error || !doc" class="rounded-lg border border-red-200 bg-red-50 p-6">
        <p class="text-red-600">{{ error?.message || 'Documentation not found' }}</p>
      </div>

      <article v-else>
        <div class="mb-6 flex flex-wrap items-center gap-3">
          <span v-if="doc.category" class="rounded-full bg-(--kc-teal) px-3 py-1 text-sm font-medium text-white">
            {{ doc.category }}
          </span>
          <span v-if="doc.difficulty_level" class="rounded-full bg-(--kc-navy) px-3 py-1 text-sm font-medium text-white">
            {{ doc.difficulty_level }}
          </span>
          <span v-if="doc.updated_at" class="text-sm text-dimmed">
            <NuxtTime :datetime="doc.updated_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
          </span>
        </div>

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

        <!-- eslint-disable-next-line vue/no-v-html -->
        <div ref="articleBodyRef" class="prose prose-lg max-w-none text-default dark:prose-invert" v-html="renderedBody"></div>

        <template v-for="(section, sectionIndex) in orderedSections" :key="`section-${sectionIndex}`">
          <section v-if="section.type === 'faq' && section.items.length" class="mt-14 space-y-4 border-t border-default pt-8">
            <div>
              <h2 class="text-2xl font-semibold text-default">{{ section.label || 'Frequently Asked Questions' }}</h2>
              <p class="mt-1 text-sm text-muted">Helpful answers related to this guide.</p>
            </div>
            <div class="space-y-3">
              <div v-for="(item, index) in section.items" :key="`faq-${index}`" class="rounded-2xl border border-default p-5">
                <h3 class="text-lg font-medium text-default">{{ item.question }}</h3>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="prose mt-3 max-w-none text-muted dark:prose-invert" v-html="item.answerHtml" />
              </div>
            </div>
          </section>

          <section v-else-if="section.type === 'how_to' && section.steps.length" class="mt-14 space-y-4 border-t border-default pt-8">
            <div>
              <h2 class="text-2xl font-semibold text-default">{{ section.label || 'How To' }}</h2>
              <p class="mt-1 text-sm text-muted">Complete the task with these ordered steps.</p>
            </div>
            <div class="space-y-4">
              <div v-for="(step, index) in section.steps" :key="`howto-${index}`" class="rounded-2xl border border-default p-5">
                <div class="flex items-start gap-4">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-default">
                    {{ index + 1 }}
                  </div>
                  <div class="min-w-0 flex-1 space-y-3">
                  <div>
                    <h3 class="text-lg font-medium text-default">{{ step.name }}</h3>
                    <a v-if="step.url" :href="step.url" class="text-sm text-(--kc-teal) hover:underline">{{ step.url }}</a>
                  </div>
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div class="prose max-w-none text-muted dark:prose-invert" v-html="step.textHtml" />
                    <img
                      v-if="step.image_public_url"
                      :src="step.image_public_url"
                      :alt="step.name"
                      class="max-h-72 w-full rounded-xl object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </template>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { useContentPageSchema } from '~/composables/useContentPageSchema'

definePageMeta({ layout: 'platform' })

// isomorphic-dompurify's jsdom shim breaks during SSR on the Workers runtime
// (no real DOM globals) — load it client-only, matching pages/experiences/[slug].vue.
// The SSR path uses a Workers-safe regex sanitizer instead of a no-op passthrough.
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }

const { resolveMedia } = useMedia()

interface DocComponent {
  type: 'faq' | 'how_to'
  label?: string | null
  status?: 'active' | 'inactive'
  render_enabled?: boolean
  schema_enabled?: boolean
  data?: {
    items?: Array<{ question?: string | null; answer?: string | null }>
    steps?: Array<{
      name?: string | null
      text?: string | null
      url?: string | null
      image_public_url?: string | null
      image_width?: number | null
      image_height?: number | null
    }>
  } | null
}

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
  components?: DocComponent[]
}

const route = useRoute()
const requestFetch = useRequestFetch()

const { data: doc, pending: loading, error } = await useAsyncData(
  `doc-${route.params.slug}`,
  async () => {
    const response = import.meta.server
      ? await requestFetch<{ doc?: Doc }>(`/api/public/docs/${route.params.slug}`)
      : await $fetch<{ doc?: Doc }>(`/api/public/docs/${route.params.slug}`)
    if (!response?.doc) {
      throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })
    }
    return response.doc
  }
)

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const renderedBody = computed(() => doc.value?.body ? renderMarkdown(doc.value.body) : '')

const articleBodyRef = ref<HTMLElement | null>(null)
useCopyableCodeBlocks(articleBodyRef, renderedBody)
const renderableComponents = computed(() => (doc.value?.components ?? []).filter(component => component.render_enabled !== false))

// How-To reads better above FAQ (action first, questions last), so sections
// are sorted by type rather than the raw `position` from the backend.
// `position` still controls ordering *within* a type when there are several
// of the same kind. True inline placement (interleaved with the article body)
// is tracked separately — see GitHub issue for the {{component:howto}} idea.
const SECTION_TYPE_PRIORITY: Record<'how_to' | 'faq', number> = { how_to: 0, faq: 1 }

const orderedSections = computed(() => renderableComponents.value.map((component) => {
  if (component.type === 'faq') {
    return {
      type: 'faq' as const,
      label: component.label,
      items: (component.data?.items ?? [])
        .filter(item => item.question && item.answer)
        .map(item => ({
          question: item.question as string,
          answerHtml: renderMarkdown(item.answer as string),
        })),
    }
  }
  return {
    type: 'how_to' as const,
    label: component.label,
    steps: (component.data?.steps ?? [])
      .filter(step => step.name && step.text)
      .map(step => ({
        name: step.name as string,
        url: step.url || '',
        image_public_url: step.image_public_url || '',
        textHtml: renderMarkdown(step.text as string),
      })),
  }
}).sort((a, b) => SECTION_TYPE_PRIORITY[a.type] - SECTION_TYPE_PRIORITY[b.type]))

const docMedia = computed(() => resolveMedia({
  public_url: doc.value?.featured_image?.public_url,
  kind: doc.value?.featured_image?.kind,
}))
const canonicalUrl = usePlatformSeoUrl(() => doc.value ? (doc.value.canonical_url || `/docs/${doc.value.slug}`) : '/docs')
const ogImage = useSharedOgImage(() => docMedia.value.thumb)
const seoTitle = computed(() => doc.value?.title || 'Documentation')
const seoDescription = computed(() => doc.value?.seo_description || doc.value?.excerpt || `Learn about ${doc.value?.title || 'this topic'} in KrabiClaw documentation.`)

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
    breadcrumbs: [
      { name: 'Docs', url: '/docs' },
      { name: doc.value.title, url: `/docs/${doc.value.slug}` },
    ],
    components: renderableComponents.value,
  }
}))
</script>
