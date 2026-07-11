<template>
  <NuxtLayout name="blawby">
    <div v-if="post" data-parity-root>
      <div class="px-6 pb-12 pt-12 sm:pb-16" data-parity-section="article-content">
        <div class="mx-auto max-w-3xl text-base leading-6 text-gray-700">
          <h3 v-if="displayTags.length" class="mt-6 inline-block rounded bg-[var(--blawby-accent)] px-2 text-sm font-semibold uppercase text-white">
            <template v-for="(tag, index) in displayTags" :key="tag">
              <span v-if="index" aria-hidden="true"> · </span>
              <NuxtLink :to="`/blog?tags[]=${encodeURIComponent(tag)}`" class="text-white no-underline">{{ tag }}</NuxtLink>
            </template>
          </h3>
          <h1 class="mt-2 text-3xl font-bold text-[var(--blawby-primary)] sm:text-4xl">{{ post.title }}</h1>
          <div class="mb-4 mt-4 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center">
              <img v-if="post.author_image" :src="post.author_image" :alt="post.author_name || ''" width="48" height="48" class="mr-4 size-12 flex-none rounded-full bg-white/10">
              <span v-else class="mr-4 flex size-12 flex-none items-center justify-center rounded-full bg-[var(--blawby-primary)] text-sm font-semibold text-white">{{ authorInitials }}</span>
              <span>
                <span v-if="post.author_name" class="block text-base leading-6 text-[var(--blawby-primary)]">{{ post.author_name }}</span>
                <time v-if="post.published_at" :datetime="post.published_at" class="block text-sm leading-5 text-gray-600">Published {{ formatDate(post.published_at) }}</time>
                <time v-if="hasUpdatedDate && post.updated_at" :datetime="post.updated_at" class="block text-xs text-gray-500">Updated {{ formatDate(post.updated_at) }}</time>
              </span>
            </div>
            <BlawbyArticleShare :title="post.title" :url="canonicalUrl" />
          </div>
          <img v-if="post.featured_image?.public_url" :src="post.featured_image.public_url" :alt="post.title" :width="post.featured_image.width || 704" :height="post.featured_image.height || 478" loading="lazy" class="aspect-video min-w-full rounded-xl bg-gray-50 object-cover">
          <div class="mt-10 min-w-full max-w-2xl">
            <p v-if="post.excerpt" class="mb-10 min-w-full italic text-[var(--blawby-primary-dark)]">{{ post.excerpt }}</p>
            <div class="prose min-w-full">
              <BlawbyRichText :content="body" unstyled class="contents" />
            </div>
            <p v-if="compliance?.disclaimer" class="mt-8 text-sm italic text-gray-500">{{ compliance.disclaimer }}</p>
          </div>
        </div>
      </div>

      <div v-if="relatedPosts.length" class="mx-auto my-8 max-w-7xl px-6 lg:px-8" data-parity-section="related-articles">
        <BlawbySectionHeading title="From the" accent="Blog" centered />
        <BlawbyArticleGrid :posts="relatedPosts" class="mx-auto my-16 max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none" />
      </div>
      <div v-if="relatedPosts.length" class="my-4 mb-8 flex justify-center" data-parity-section="related-articles-more">
        <BlawbyButton to="/blog">See All</BlawbyButton>
      </div>

      <BlawbyConsultationCta
        :title="String(ctaBlock?.title || 'Get started today')"
        :description="optionalString(ctaBlock?.description)"
        :label="String(ctaBlock?.label || consultation.cta_label)"
        :destination="consultation.external_url || String(ctaBlock?.url || consultation.schedule_path)"
        :background-url="assetUrl(ctaBlock?.background)"
        :featured-url="assetUrl(ctaBlock?.featured)"
        @click="trackConsultation"
      />
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { serializeJsonLd } from '~/utils/json-ld'
import { stripLeadingTitleHeading } from '~/utils/markdown'

const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })
const { isTenant } = useTenantSite()
if (!isTenant) throw createError({ statusCode: 404 })
definePageMeta({ layout: false })

const slug = String(useRoute().params.slug || '')
const { data, error } = await useBlawbyRoute('article', slug)
if (error.value) throw error.value
if (!data.value.post) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })

const { identity, consultation, compliance } = await useBlawbyShell()
const post = computed(() => data.value.post!)
const ctaBlock = computed(() => data.value.page?.components.find(component => component.type === 'consultation_cta') ?? null)
const body = computed(() => stripLeadingTitleHeading(post.value.body || '', post.value.title))
const displayTags = computed(() => post.value.tags.slice(1))
const hasUpdatedDate = computed(() => Boolean(post.value.updated_at && post.value.updated_at !== post.value.published_at))
const authorInitials = computed(() => String(post.value.author_name || 'NCLS Staff').split(/\s+/).map(part => part[0]).join('').slice(0, 2))
const relatedPosts = computed(() => data.value.posts.filter(item => item.slug !== slug).slice(0, 3))
const canonicalUrl = useSeoUrl(() => post.value.canonical_url || `/article/${post.value.slug}`)
const seoTitle = computed(() => `${post.value.title} | ${identity.value.brand_name || 'Professional services'}`)
const seoDescription = computed(() => post.value.seo_description || post.value.excerpt || '')
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value))
}
function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}
function trackConsultation() {
  trackConsultationClick('article', `/article/${slug}`, consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({ title: seoTitle, description: seoDescription, ogTitle: seoTitle, ogDescription: seoDescription, ogUrl: canonicalUrl, ogType: 'article', ogImage: computed(() => post.value.featured_image?.public_url || undefined) })
useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  meta: post.value.robots ? [{ name: 'robots', content: post.value.robots }] : [],
  script: [{ type: 'application/ld+json', children: serializeJsonLd({
    '@context': 'https://schema.org', '@type': 'Article', headline: post.value.title, description: seoDescription.value, url: canonicalUrl.value,
    datePublished: post.value.published_at || post.value.created_at || undefined, dateModified: post.value.updated_at || post.value.published_at || undefined,
    image: post.value.featured_image?.public_url ? [post.value.featured_image.public_url] : undefined,
    author: post.value.author_name ? { '@type': 'Person', name: post.value.author_name } : undefined,
    publisher: { '@type': 'Organization', name: identity.value.brand_name || 'Professional services' }, mainEntityOfPage: canonicalUrl.value,
  }) }],
}))
</script>
