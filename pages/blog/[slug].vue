<template>
  <div class="container mx-auto px-4 py-16">
    <div class="mx-auto max-w-3xl">
      <NuxtLink to="/blog" class="mb-10 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-default">
        <UIcon name="i-heroicons-arrow-left" class="h-4 w-4" />
        Back to Blog
      </NuxtLink>

      <div v-if="pending" class="space-y-4">
        <div class="h-6 w-1/4 animate-pulse rounded bg-elevated" />
        <div class="h-12 w-3/4 animate-pulse rounded bg-elevated" />
        <div class="h-12 w-1/2 animate-pulse rounded bg-elevated" />
        <div class="mt-4 h-5 w-2/3 animate-pulse rounded bg-elevated" />
        <div class="mt-8 space-y-3">
          <div v-for="i in 10" :key="i" class="h-4 animate-pulse rounded bg-elevated" :style="`width: ${70 + (i % 3) * 10}%`" />
        </div>
      </div>

      <div v-else-if="error || !post" class="py-24 text-center">
        <p class="mb-6 text-xl text-muted">Article not found.</p>
        <UButton to="/blog" variant="outline" color="neutral">Back to Blog</UButton>
      </div>

      <article v-else>
        <div class="mb-6 flex flex-wrap items-center gap-3">
          <span v-if="post.category" class="rounded-full px-3 py-1 text-sm font-medium" :class="categoryClass(post.category)">
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

        <!-- eslint-disable vue/no-v-html -->
        <div
          class="prose prose-lg max-w-none
                 prose-headings:text-default prose-headings:font-bold
                 prose-p:leading-relaxed prose-p:text-muted
                 prose-a:text-(--kc-teal) prose-a:no-underline hover:prose-a:underline
                 prose-strong:text-default
                 prose-li:text-muted
                 prose-hr:border-default
                 prose-blockquote:border-l-(--kc-teal) prose-blockquote:text-muted
                 dark:prose-invert"
          v-html="renderedBody"
        />
        <!-- eslint-enable vue/no-v-html -->

        <section v-if="faqItems.length" class="mt-14 space-y-4 border-t border-default pt-8">
          <div>
            <h2 class="text-2xl font-semibold text-default">Frequently Asked Questions</h2>
            <p class="mt-1 text-sm text-muted">Quick answers related to this article.</p>
          </div>
          <div class="space-y-3">
            <div v-for="(item, index) in faqItems" :key="`faq-${index}`" class="rounded-2xl border border-default p-5">
              <h3 class="text-lg font-medium text-default">{{ item.question }}</h3>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="prose mt-3 max-w-none text-muted dark:prose-invert" v-html="item.answerHtml" />
            </div>
          </div>
        </section>

        <section v-if="howToSteps.length" class="mt-14 space-y-4 border-t border-default pt-8">
          <div>
            <h2 class="text-2xl font-semibold text-default">How To</h2>
            <p class="mt-1 text-sm text-muted">Follow these steps in order.</p>
          </div>
          <div class="space-y-4">
            <div v-for="(step, index) in howToSteps" :key="`howto-${index}`" class="rounded-2xl border border-default p-5">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { renderMarkdownToHtml } from '~/utils/markdown'
import { useContentPageSchema } from '~/composables/useContentPageSchema'
import DOMPurify from 'isomorphic-dompurify'

const { resolveMedia } = useMedia()

definePageMeta({ layout: 'platform' })

interface BlogComponent {
  type: 'faq' | 'how_to'
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
  components?: BlogComponent[]
}

const route = useRoute()
const requestFetch = useRequestFetch()
const postEndpoint = computed(() => `/api/public/blog/posts/${String(route.params.slug)}`)

const CATEGORY_CLASSES: Record<string, string> = {
  Marketing: 'bg-amber-100 text-amber-800',
  Technology: 'bg-emerald-100 text-emerald-800',
  Design: 'bg-indigo-100 text-indigo-800',
  Business: 'bg-rose-100 text-rose-800',
  SEO: 'bg-violet-100 text-violet-800',
  'Social Media': 'bg-sky-100 text-sky-800',
}

const { data, pending, error } = await useAsyncData(
  () => `blog-post-${postEndpoint.value}`,
  async () => {
    const payload = import.meta.server
      ? await requestFetch<{ post?: BlogPost }>(postEndpoint.value)
      : await $fetch<{ post?: BlogPost }>(postEndpoint.value)
    if (!payload.post) return payload
    return {
      post: {
        ...payload.post,
        author_subtitle: payload.post.author_subtitle || payload.post.author_bio || '',
      },
    }
  }
)

const post = computed(() => data.value?.post ?? null)
const authorSubtitle = computed(() => post.value?.author_subtitle || '')

function renderMarkdown(markdown: string) {
  return DOMPurify.sanitize(renderMarkdownToHtml(markdown || ''))
}

const renderedBody = computed(() => post.value?.body ? renderMarkdown(post.value.body) : '')

const renderableComponents = computed(() => (post.value?.components ?? []).filter(component => component.render_enabled !== false))

const faqItems = computed(() => {
  const faq = renderableComponents.value.find(component => component.type === 'faq')
  return (faq?.data?.items ?? [])
    .filter(item => item.question && item.answer)
    .map(item => ({
      question: item.question as string,
      answerHtml: renderMarkdown(item.answer as string),
    }))
})

const howToSteps = computed(() => {
  const howTo = renderableComponents.value.find(component => component.type === 'how_to')
  return (howTo?.data?.steps ?? [])
    .filter(step => step.name && step.text)
    .map(step => ({
      name: step.name as string,
      url: step.url || '',
      image_public_url: step.image_public_url || '',
      image_width: step.image_width ?? null,
      image_height: step.image_height ?? null,
      textHtml: renderMarkdown(step.text as string),
      text: step.text as string,
    }))
})

const readTime = computed(() => {
  const words = (post.value?.body ?? '').split(/\s+/).length
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

function categoryClass(cat: string) {
  return CATEGORY_CLASSES[cat] ?? 'bg-stone-100 text-stone-800'
}

const postMedia = computed(() => resolveMedia({
  public_url: post.value?.featured_image?.public_url,
  kind: post.value?.featured_image?.kind,
}))

const canonicalUrl = useSeoUrl(() => post.value ? (post.value.canonical_url || `/blog/${post.value.slug}`) : '/blog')
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
    breadcrumbs: [
      { name: 'Blog', url: '/blog' },
      { name: post.value.title, url: `/blog/${post.value.slug}` },
    ],
    components: post.value.components,
  }
}))
</script>
