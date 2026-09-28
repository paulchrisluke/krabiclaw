<template>
  <div v-if="post" data-parity-root>
    <div class="text-base leading-6 text-gray-700" data-parity-section="article-content">
      <div class="mx-auto max-w-3xl">
        <BlogArticleRenderer :title="post.title" :excerpt="post.excerpt" :tags="post.tags" :tag-index-path="localePath('/blog')" :published-at="post.published_at" :updated-at="post.updated_at" :author-name="post.author?.name" :author-image="post.author?.image" :organization-name="identity.name" :blocks="post.content_blocks" template="blawby" />
        <p v-if="compliance?.disclaimer" class="mt-8 text-sm italic text-gray-500">{{ compliance.disclaimer }}</p>
      </div>

      <div v-if="relatedPosts.length" class="my-8" data-parity-section="related-articles">
        <BlawbySectionHeading :title="`${t('blawby.article.from_the')} ${t('saya.footer.blog')}`" :accent="t('saya.footer.blog')" centered />
        <BlawbyArticleGrid :posts="relatedPosts" class="mx-auto my-16 max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none" />
      </div>
      <div v-if="relatedPosts.length" class="my-4 mb-8 flex justify-center" data-parity-section="related-articles-more">
        <BlawbyButton :to="localePath('/blog')">{{ t('saya.common.view_all') }}</BlawbyButton>
      </div>
    </div>

    <BlawbyConsultationCta
      v-if="ctaBlockRaw"
      :block="ctaBlockRaw"
      :page="articlePage!"
      :destination-override="consultation.external_url || null"
      @click="trackConsultation"
    />
  </div>
</template>

<script setup lang="ts">
import { relatedArticles } from '~/composables/usePublishedArticles'
import { resolveSocialImageUrl } from '~/utils/social-metadata'

const { isBlawby } = usePublicTemplate()
if (!isBlawby.value) throw createError({ statusCode: 404 })
const { isTenant } = useTenantOrganization()
if (!isTenant) throw createError({ statusCode: 404 })
definePageMeta({ layout: 'articles', articleCollection: 'blog' })

const slug = String(useRoute().params.slug || '')
const { localePath, t } = useI18n()
const { data, error, shell } = await useBlawbyRoute('article', slug)
if (error.value) throw error.value
if (!data.value.post) throw createError({ statusCode: 404, statusMessage: 'Article not found', fatal: true })
if (!Array.isArray(data.value.post.content_blocks) || data.value.post.content_blocks.length === 0) {
  throw createError({ statusCode: 500, statusMessage: 'Published article content is missing its canonical blocks' })
}

const identity = computed(() => shell.value.identity)
const consultation = computed(() => shell.value.consultation)
const compliance = computed(() => shell.value.compliance)
const org = useBlawbyOrgIdentity(identity, compliance)
const { posts: publishedArticles } = await usePublishedArticles('blog')
const post = computed(() => data.value.post!)
const articleSocialMedia = computed(() => post.value.cover ?? null)
const articleSocialImage = computed(() => resolveSocialImageUrl(articleSocialMedia.value))
const articlePage = computed(() => data.value.page ?? null)
const ctaBlockRaw = computed(() => articlePage.value?.blocks.find(block => block.type === 'contact_cta') ?? null)
const relatedPosts = computed(() => relatedArticles(publishedArticles.value, post.value))
const requestURL = useRequestURL()
const articlePath = computed(() => `/article/${post.value.slug}`)
const resolvedSeo = computed(() => resolveBlogSeo({
  title: post.value.title, excerpt: post.value.excerpt, slug: post.value.slug,
  baseUrl: requestURL.origin, publicPath: articlePath.value, organizationName: identity.value.name,
}))
const { trackConsultationClick } = useOrganizationConversionTracking(consultation)

function trackConsultation() {
  trackConsultationClick('article', `/article/${slug}`, consultation.value.external_url || consultation.value.schedule_path)
}

const { canonicalUrl } = useSocialMetadata(() => ({
  path: resolvedSeo.value.canonicalUrl,
  title: resolvedSeo.value.title,
  description: resolvedSeo.value.description,
  pageType: 'article',
  author: post.value.author?.name || null,
  publishedAt: post.value.published_at || null,
  brand: {
    organizationName: identity.value.name,
  },
  socialImage: post.value.social_image,
  discoverability: post.value.visibility === 'unlisted' ? 'unlisted' : 'listed',
}))

const blogUrl = useSeoUrl(() => localePath('/blog'))
const homeUrl = useSeoUrl(() => localePath('/'))

useVideoSchema(() => post.value.content_blocks, canonicalUrl)

useProfessionalServiceSchema(() => ({
  recipe: 'article',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: post.value.title,
  pageDescription: resolvedSeo.value.description,
  imageUrl: articleSocialImage.value,
  imageWidth: articleSocialMedia.value?.width || null,
  imageHeight: articleSocialMedia.value?.height || null,
  breadcrumbs: [
    { name: t('saya.experience_detail.home'), url: homeUrl.value },
    { name: t('saya.footer.blog'), url: blogUrl.value },
    { name: post.value.title, url: canonicalUrl.value },
  ],
  article: {
    headline: post.value.title,
    datePublished: post.value.published_at || post.value.created_at || null,
    dateModified: post.value.updated_at || post.value.published_at || null,
    authorName: post.value.author?.name || undefined,
  },
}))
</script>
