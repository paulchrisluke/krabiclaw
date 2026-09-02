<template>
  <main v-if="post" class="min-h-screen bg-default text-default">
    <SayaPostDetail :post="post" :brand="postBrand" />
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

interface PublicPostMedia {
  asset_id: string
  public_url: string
  thumbnail_url: string | null
  kind: 'image' | 'video'
  slot: 'cover' | 'gallery'
  sort_order: number
  alt_text: string | null
  width: number | null
  height: number | null
}

interface PublicPost {
  id: string
  slug: string
  title: string
  body: string
  summary: string
  post_type: 'standard' | 'offer' | 'event' | 'update'
  published_at: string | null
  public_path: string
  canonical_url: string | null
  seo_title?: string | null
  seo_description?: string | null
  media: PublicPostMedia[]
  social_image: import('~/utils/social-metadata').SocialImageSource | null
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
  location?: { id: string; title: string | null; slug: string | null } | null
  localeRepresentations: Array<{ locale: string; label: string; route_path: string; source: 'source' | 'localized' }>
}

const isPublicPostResponse = (value: unknown): value is { post: PublicPost } =>
  isRecord(value)
  && isRecord(value.post)
  && typeof value.post.id === 'string'
  && typeof value.post.slug === 'string'
  && typeof value.post.title === 'string'
  && typeof value.post.body === 'string'
  && Array.isArray(value.post.localeRepresentations)
  && value.post.localeRepresentations.every(item => isRecord(item)
    && typeof item.locale === 'string'
    && typeof item.label === 'string'
    && typeof item.route_path === 'string'
    && (item.source === 'source' || item.source === 'localized'))

const route = useRoute()
const requestEvent = useRequestEvent()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { site: publicSite } = useSiteShellState()
const { locale } = useI18n()

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => site?.brand_name?.trim() ?? '')
const postBrand = computed(() => ({
  name: siteName.value,
  logoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || null,
}))

const { data, error } = await useAsyncData(
  () => `public-post-${siteId}-${locale.value}-${slug.value}`,
  async () => {
    let post: PublicPost | null | undefined
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
      const [{ cloudflareEnv }, { getPublishedPostByPublicRoute }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/post-management'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.DB
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      post = await getPublishedPostByPublicRoute(db, siteId, slug.value, locale.value, env) as PublicPost | null
    } else {
      const payload = await publicApiRequest<{ post: PublicPost }>(
        `/api/public/sites/${siteId}/posts/${encodeURIComponent(slug.value)}`,
        { query: { locale: locale.value }, validate: isPublicPostResponse },
      )
      post = payload.post
    }
    if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    return { post }
  },
)

if (error.value) throw error.value
useState<PublicPost['localeRepresentations']>('public-locale-representations', () => []).value = data.value?.post.localeRepresentations ?? []

const post = computed(() => data.value?.post ?? null)
const pagePath = computed(() => post.value?.public_path || `/posts/${slug.value}`)
const seoTitle = computed(() => post.value?.seo_title || post.value?.title || `Update from ${siteName.value}`)
const seoDescription = computed(() => post.value?.seo_description || post.value?.summary || post.value?.body || `Latest update from ${siteName.value}.`)
const { canonicalUrl, ogImageUrl } = useSocialMetadata(() => ({
  path: post.value?.canonical_url || pagePath.value,
  title: seoTitle.value,
  description: seoDescription.value,
  pageType: 'article',
  brand: { siteName: siteName.value },
  socialImage: post.value?.social_image ?? null,
  publishedAt: post.value?.published_at || null,
}))

useSchemaOrg([
  computed(() => ({
    '@type': 'Article',
    headline: seoTitle.value,
    description: seoDescription.value,
    datePublished: post.value?.published_at,
    image: ogImageUrl.value,
    url: canonicalUrl.value,
    author: { '@type': 'Organization', name: siteName.value },
    publisher: {
      '@type': 'Organization',
      name: siteName.value,
      logo: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url
        ? { '@type': 'ImageObject', url: publicSite.value.media.find(item => item.slot === 'logo')!.public_url }
        : undefined,
    },
  })),
])
</script>
