<template>
  <NuxtLayout name="blawby">
    <article v-if="post" class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <p v-if="post.category" class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">{{ post.category }}</p>
      <h1 class="mt-4 blawby-display text-5xl leading-tight text-[var(--blawby-primary)]">{{ post.title }}</h1>
      <p v-if="post.excerpt" class="mt-5 text-lg leading-8 text-slate-600">{{ post.excerpt }}</p>
      <img v-if="postMedia.url" :src="postMedia.url" :alt="post.title" class="mt-10 aspect-[16/9] w-full object-cover">
      <BlawbyRichText class="mt-10" :content="body" />
    </article>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { stripLeadingTitleHeading } from '~/utils/markdown'

const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })

const { isTenant, siteId, site } = useTenantSite()
if (!isTenant || !siteId) throw createError({ statusCode: 404 })

definePageMeta({ layout: false })

interface TenantBlogPost {
  id: string
  title: string
  slug: string
  body: string
  excerpt?: string | null
  category?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  robots?: string | null
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  featured_image?: { public_url: string | null; kind: string | null; width: number | null; height: number | null } | null
}

const route = useRoute()
const articleEndpoint = computed(() => `/api/public/sites/${siteId}/blog/${String(route.params.slug)}`)

const { data, error } = await useAsyncData<{ blogPost: TenantBlogPost | null }>(
  () => `blawby-article-${siteId}-${String(route.params.slug)}`,
  async () => {
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
      const [{ cloudflareEnv }, { getPublishedSiteBlogPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/platform-content'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const blogPost = await getPublishedSiteBlogPost(db, siteId, String(route.params.slug)) as TenantBlogPost | null
      return { blogPost }
    }
    const payload = await $fetch<{ post: TenantBlogPost | null }>(articleEndpoint.value)
    return { blogPost: payload.post }
  },
  {
    getCachedData(k, nuxtApp) {
      return nuxtApp.payload.data[k] as { blogPost: TenantBlogPost | null } | undefined
    },
  },
)

if (error.value) throw error.value
if (!data.value?.blogPost) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })

const { resolveMedia } = useMedia()
const post = computed(() => data.value?.blogPost ?? null)
const body = computed(() => stripLeadingTitleHeading(post.value?.body || '', post.value?.title))
const postMedia = computed(() => resolveMedia({
  public_url: post.value?.featured_image?.public_url,
  kind: post.value?.featured_image?.kind,
}))
const siteName = computed(() => site?.brand_name || 'Professional services')
const canonicalUrl = useSeoUrl(() => post.value?.canonical_url || `/article/${post.value?.slug || ''}`)
const seoTitle = computed(() => post.value ? `${post.value.title} | ${siteName.value}` : 'Article')
const seoDescription = computed(() => post.value?.seo_description || post.value?.excerpt || `An article from ${siteName.value}.`)
const articleStructuredData = computed(() => post.value ? {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: post.value.title,
  description: seoDescription.value,
  url: canonicalUrl.value,
  datePublished: post.value.published_at || post.value.created_at || undefined,
  dateModified: post.value.updated_at || post.value.published_at || undefined,
  image: postMedia.value.url ? [postMedia.value.url] : undefined,
  publisher: {
    '@type': 'Organization',
    name: siteName.value,
  },
  mainEntityOfPage: canonicalUrl.value,
} : null)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: siteName,
  ogUrl: canonicalUrl,
  ogType: 'article',
  ogImage: computed(() => postMedia.value.url || undefined),
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  meta: post.value?.robots ? [{ name: 'robots', content: post.value.robots }] : [],
  script: articleStructuredData.value
    ? [{ type: 'application/ld+json', innerHTML: JSON.stringify(articleStructuredData.value) }]
    : [],
}))
</script>
