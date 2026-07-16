<template>
  <NuxtLayout name="blawby">
    <div v-if="post" data-parity-root>
      <div class="mx-auto max-w-7xl px-6 pb-12 pt-12 sm:pb-16 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 lg:px-8" data-parity-section="article-content">
        <!--
          Sidebar is removed from the mobile document flow entirely (`hidden lg:block`), not
          just visually collapsed — it used to render above the article on mobile with no
          breakpoint gate, delaying the headline by roughly a full screen and reading as the
          page's primary content. It only reappears once the grid actually puts it side by
          side with the article at `lg:` (~992px, see --breakpoint-lg in assets/css/main.css).
        -->
        <aside class="hidden lg:sticky lg:top-28 lg:block lg:h-fit lg:pt-6">
          <PlatformCommandSearchTrigger surface="tenant_blog" variant="blawby" label="Search articles..." aria-label="Open article search" class="mb-6" />
          <BlogCategoryNav :categories="categories" base-path="/article" :active-slug="slug" />
        </aside>

        <div class="min-w-0 text-base leading-6 text-gray-700">
          <div class="mx-auto max-w-3xl">
            <!-- Mobile-only compact control replacing the sidebar: search + a drawer with
                 the same category nav shown in the desktop sidebar. -->
            <div class="flex items-center gap-3 lg:hidden">
              <PlatformCommandSearchTrigger surface="tenant_blog" variant="blawby" label="Search articles" aria-label="Search articles" class="flex-1" />
              <button
                type="button"
                class="group flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--blawby-border)] bg-[var(--blawby-surface)] px-3 py-2.5 text-sm font-medium transition hover:border-[var(--blawby-primary)] hover:bg-[var(--blawby-accent-100)]"
                aria-haspopup="dialog"
                :aria-expanded="browseTopicsOpen"
                @click="browseTopicsOpen = true"
              >
                <PlatformIcon name="list" class="size-4 shrink-0 text-[var(--blawby-ink)] opacity-60 transition group-hover:opacity-100" />
                <span class="text-[var(--blawby-ink)] opacity-60 transition group-hover:opacity-100">Browse topics</span>
              </button>
            </div>
            <h3 v-if="displayTags.length" class="mt-6 inline-block rounded bg-[var(--blawby-accent)] px-2 text-sm font-semibold uppercase text-white">
              <template v-for="(tag, index) in displayTags" :key="tag">
                <span v-if="index" aria-hidden="true"> · </span>
                <NuxtLink :to="`/blog?tags[]=${encodeURIComponent(tag)}`" class="text-white no-underline">{{ tag }}</NuxtLink>
              </template>
            </h3>
            <BlogArticleView :title="post.title" :excerpt="post.excerpt" category="Article" :published-at="post.published_at" :updated-at="hasUpdatedDate ? post.updated_at : null" :author-name="post.author_name" :author-image="post.author_image" :site-name="identity.brand_name" :media-url="post.social_image?.public_url || post.featured_image?.public_url" media-kind="image" :blocks="post.content_blocks" template="blawby">
              <template #legacy-body><div class="prose min-w-full"><BlawbyRichText :content="body" unstyled class="contents" /></div></template>
            </BlogArticleView>
            <p v-if="compliance?.disclaimer" class="mt-8 text-sm italic text-gray-500">{{ compliance.disclaimer }}</p>
          </div>

          <div v-if="relatedPosts.length" class="my-8" data-parity-section="related-articles">
            <BlawbySectionHeading title="From the" accent="Blog" centered />
            <BlawbyArticleGrid :posts="relatedPosts" class="mx-auto my-16 max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none" />
          </div>
          <div v-if="relatedPosts.length" class="my-4 mb-8 flex justify-center" data-parity-section="related-articles-more">
            <BlawbyButton to="/blog">See All</BlawbyButton>
          </div>
        </div>
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
      <ClientOnly>
        <PlatformCommandSearchModal surface="tenant_blog" variant="blawby" />
      </ClientOnly>

      <!-- Mobile "Browse topics" drawer — same search trigger + category nav as the
           desktop sidebar, just reachable from the compact control instead of always
           occupying document flow. -->
      <PlatformDrawer v-model="browseTopicsOpen" title="Browse topics">
        <PlatformCommandSearchTrigger surface="tenant_blog" variant="blawby" label="Search articles..." aria-label="Open article search" class="mb-6" @click="browseTopicsOpen = false" />
        <BlogCategoryNav :categories="categories" base-path="/article" :active-slug="slug" @click="browseTopicsOpen = false" />
      </PlatformDrawer>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import PlatformDrawer from '~/components/platform/PlatformDrawer.vue'
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
const org = useBlawbyOrgIdentity(identity, compliance)
const post = computed(() => data.value.post!)
const ctaBlock = computed(() => data.value.page?.components.find(component => component.type === 'consultation_cta') ?? null)
const body = computed(() => stripLeadingTitleHeading(post.value.body || '', post.value.title))
const displayTags = computed(() => post.value.tags.slice(1))
const hasUpdatedDate = computed(() => Boolean(post.value.updated_at && post.value.updated_at !== post.value.published_at))
const relatedPosts = computed(() => data.value.posts.filter(item => item.slug !== slug).slice(0, 3))
const { categories } = useTenantBlogNav(computed(() => data.value.posts))
const browseTopicsOpen = ref(false)
const seoTitle = computed(() => post.value.seo_title?.trim() || post.value.title)
const seoDescription = computed(() => post.value.seo_description || post.value.excerpt || '')
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
function assetUrl(value: unknown) {
  return value && typeof value === 'object' && typeof (value as ApiRecord).url === 'string' ? String((value as ApiRecord).url) : null
}
function trackConsultation() {
  trackConsultationClick('article', `/article/${slug}`, consultation.value.external_url || consultation.value.schedule_path)
}

const { canonicalUrl } = useTenantSocialMetadata(() => ({
  path: post.value.canonical_url || `/article/${post.value.slug}`,
  title: seoTitle.value,
  description: seoDescription.value,
  pageType: 'article',
  label: 'Article',
  author: post.value.author_name || null,
  publishedAt: post.value.published_at || null,
  brand: {
    siteName: identity.value.brand_name || 'Professional services',
    logoUrl: identity.value.logo_url || null,
    faviconUrl: identity.value.favicon_url || null,
  },
  heroImage: (post.value.social_image?.public_url || post.value.featured_image?.public_url)
    ? {
        url: (post.value.social_image?.public_url || post.value.featured_image?.public_url)!,
        width: post.value.social_image?.width || post.value.featured_image?.width || undefined,
        height: post.value.social_image?.height || post.value.featured_image?.height || undefined,
      }
    : null,
  robots: post.value.visibility === 'unlisted' ? 'noindex,follow' : post.value.robots || null,
}))

const blogUrl = useSeoUrl(() => '/blog')
const homeUrl = useSeoUrl(() => '/')

useProfessionalServiceSchema(() => ({
  recipe: 'article',
  org: org.value,
  pageUrl: canonicalUrl.value,
  pageTitle: post.value.title,
  pageDescription: seoDescription.value,
  imageUrl: post.value.social_image?.public_url || post.value.featured_image?.public_url || null,
  imageWidth: post.value.social_image?.width || post.value.featured_image?.width || null,
  imageHeight: post.value.social_image?.height || post.value.featured_image?.height || null,
  breadcrumbs: [
    { name: 'Home', url: homeUrl.value },
    { name: 'Blog', url: blogUrl.value },
    { name: post.value.title, url: canonicalUrl.value },
  ],
  article: {
    headline: post.value.title,
    datePublished: post.value.published_at || post.value.created_at || null,
    dateModified: post.value.updated_at || post.value.published_at || null,
    authorName: post.value.author_name || null,
  },
}))
</script>
