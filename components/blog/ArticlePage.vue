<template>
  <!--
    One article, on every template and in every collection: a blog post on
    Saya, an article on Blawby, a post or a doc on Krabiclaw's own site. The
    template's layout is the chrome around it and its design tokens are the
    only other difference.
  -->
  <div class="xl:grid xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-10">
    <div class="min-w-0">
      <ArticleBreadcrumb :crumbs="breadcrumbs" />

      <div ref="articleBodyRef" data-parity-section="article-content">
        <BlogArticleRenderer
          :title="post.title"
          :excerpt="post.excerpt"
          :tags="post.tags"
          :tag-index-path="indexPath"
          :published-at="post.published_at"
          :updated-at="post.updated_at"
          :author-name="authorName"
          :author-image="post.author?.image ?? null"
          :organization-name="organizationName"
          :blocks="post.content_blocks"
          :template="template.slug"
        />
      </div>

      <nav v-if="previousArticle || nextArticle" :aria-label="indexLabel" class="mt-16 flex items-start justify-between gap-6 border-t border-default pt-8">
        <NuxtLink v-if="previousArticle" :to="previousArticle.path" class="group flex min-w-0 flex-initial flex-col gap-1 no-underline">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{{ t('saya.posts.previous') }}</span>
          <span class="flex w-full min-w-0 items-center gap-1.5 text-lg font-semibold text-default group-hover:text-primary">
            <PlatformIcon name="arrow-left" class="size-4 shrink-0" />
            <span class="min-w-0 truncate">{{ previousArticle.title }}</span>
          </span>
        </NuxtLink>
        <span v-else />
        <NuxtLink v-if="nextArticle" :to="nextArticle.path" class="group flex min-w-0 flex-initial flex-col items-end gap-1 text-right no-underline">
          <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{{ t('saya.posts.next') }}</span>
          <span class="flex w-full min-w-0 items-center gap-1.5 text-lg font-semibold text-default group-hover:text-primary">
            <span class="min-w-0 truncate">{{ nextArticle.title }}</span>
            <PlatformIcon name="arrow-right" class="size-4 shrink-0" />
          </span>
        </NuxtLink>
      </nav>
    </div>

    <aside class="hidden xl:block">
      <ArticleToc :html="tocHtml" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import ArticleBreadcrumb from '~/components/blog/ArticleBreadcrumb.vue'
import ArticleToc from '~/components/blog/ArticleToc.vue'
import BlogArticleRenderer from '~/components/blog/BlogArticleRenderer.vue'
import { useContentPageSchema } from '~/composables/useContentPageSchema'
import { structuredComponentsFromBlocks } from '~/utils/blog-editor'
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { loadDomPurify } from '~/utils/dom-purify-loader'
import { resolveSocialImageUrl } from '~/utils/social-metadata'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { ARTICLE_COLLECTIONS, type ArticleCollection } from '~/utils/article-collections'

const props = defineProps<{ collection: ArticleCollection }>()

const DOMPurify = import.meta.client ? await loadDomPurify() : { sanitize: sanitizeHtmlForSsr }
const route = useRoute()
const { t, localePath } = useI18n()
const { template } = usePublicTemplate()
const { organization } = useTenantOrganization()
const locale = useState<string>('public-locale', () => 'en')

const slug = computed(() => String(route.params.slug || '').trim())
if (!slug.value) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
const post = await usePublishedArticle(props.collection, slug)
const { posts: articles } = await usePublishedArticles(props.collection)

const organizationName = computed(() => organization?.name?.trim() || null)
const authorName = computed(() => post.value.author?.name ?? null)
// Each collection's index is at its own prefix on every template; only a blog article's own path varies (/blog or /article).
const indexPath = computed(() => localePath(ARTICLE_COLLECTIONS[props.collection].pathPrefix))
const indexLabel = computed(() => props.collection === 'docs' ? t('saya.footer.docs') : t('saya.footer.blog'))
const articlePath = computed(() => localePath(tenantBlogPostPath(template.value, post.value.slug, props.collection)))
const breadcrumbs = computed(() => [
  { name: indexLabel.value, url: indexPath.value },
  { name: post.value.title, url: articlePath.value },
])

// Previous and next walk the collection in the order its index and sidebar list it.
const currentIndex = computed(() => articles.value.findIndex(item => item.id === post.value.id || item.slug === post.value.slug))
const previousArticle = computed(() => currentIndex.value > 0 ? articles.value[currentIndex.value - 1] : null)
const nextArticle = computed(() => currentIndex.value >= 0 && currentIndex.value < articles.value.length - 1 ? articles.value[currentIndex.value + 1] : null)

const tocHtml = computed(() => post.value.content_blocks
  .filter(block => block.type === 'heading' || block.type === 'markdown')
  .map((block) => {
    if (block.type !== 'heading') return DOMPurify.sanitize(renderMarkdownToHtml(String(block.data.markdown || '')))
    const level = Math.max(2, Math.min(6, block.level || 2))
    return `<h${level}>${DOMPurify.sanitize(String(block.data.text || ''))}</h${level}>`
  })
  .join('\n'))
const articleBodyRef = shallowRef<Element | null>(null)
useCopyableCodeBlocks(articleBodyRef, computed(() => post.value.content_blocks))

const requestURL = useRequestURL()
const runtimeConfig = useRuntimeConfig()
const origin = computed(() => template.value.slug === 'platform' ? runtimeConfig.public.platformUrl : requestURL.origin)
const resolvedSeo = computed(() => resolveBlogSeo({
  title: post.value.title, excerpt: post.value.excerpt, slug: post.value.slug,
  baseUrl: origin.value, publicPath: articlePath.value, organizationName: organizationName.value ?? '',
}))
const { canonicalUrl } = useSocialMetadata(() => ({
  schema: false,
  pageType: 'article' as const,
  title: resolvedSeo.value.title,
  description: resolvedSeo.value.description,
  path: resolvedSeo.value.canonicalUrl,
  brand: { organizationName: organizationName.value ?? '' },
  author: authorName.value,
  publishedAt: post.value.published_at || null,
  discoverability: post.value.visibility === 'unlisted' ? 'unlisted' : 'listed',
  socialImage: post.value.social_image ?? null,
}))

useHead(() => ({
  meta: post.value.seo_keywords?.trim() ? [{ name: 'keywords', content: post.value.seo_keywords.trim() }] : [],
}))

useVideoSchema(() => post.value.content_blocks, canonicalUrl)

useContentPageSchema(computed(() => ({
  articleType: props.collection === 'docs' ? 'TechArticle' as const : 'BlogPosting' as const,
  url: canonicalUrl.value,
  title: post.value.title,
  description: resolvedSeo.value.description,
  imageUrl: resolveSocialImageUrl(post.value.cover ?? null) || undefined,
  imageWidth: post.value.cover?.width ?? undefined,
  imageHeight: post.value.cover?.height ?? undefined,
  datePublished: post.value.published_at,
  dateModified: post.value.updated_at,
  authorName: authorName.value,
  articleSection: post.value.category || undefined,
  keywords: post.value.seo_keywords || undefined,
  inLanguage: locale.value === 'en' ? 'en-US' : locale.value,
  breadcrumbs: breadcrumbs.value,
  components: structuredComponentsFromBlocks(post.value.content_blocks),
  organizationName: organizationName.value,
  organizationLogoUrl: organization?.media?.find(item => item.slot === 'logo')?.public_url || undefined,
  organizationDescription: organization?.brand_description || undefined,
})))
</script>
