<template>
  <main v-if="post" class="min-h-screen bg-default text-default">
    <SayaPostDetail :post="post" :brand="postBrand" />
  </main>
</template>

<script setup lang="ts">
// Shared by pages/posts/[slug].vue (English, matched directly by Nuxt's
// file router) and the locale-prefixed catch-all (pages/[...tenantPath].vue,
// representation.kind === 'resource' with resource_type 'site_post'). See
// components/tenant-pages/LocationQaPage.vue for why this can't be a route
// alias instead.
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
  cta_type: string | null
  cta_url: string | null
  event_title: string | null
  event_start: string | null
  event_end: string | null
  offer_coupon: string | null
  offer_terms: string | null
  location?: { id: string; title: string | null; slug: string | null } | null
}

const isPublicPostResponse = (value: unknown): value is { post: PublicPost } =>
  isRecord(value)
  && isRecord(value.post)
  && typeof value.post.id === 'string'
  && typeof value.post.slug === 'string'
  && typeof value.post.title === 'string'
  && typeof value.post.body === 'string'

const props = defineProps<{ slug?: string }>()
const route = useRoute()
const requestEvent = useRequestEvent()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { site: publicSite } = useSiteShellState()
const locale = useState<string>('public-locale', () => 'en')

const slug = computed(() => props.slug ?? String(route.params.slug ?? ''))
const siteName = computed(() => site?.brand_name?.trim() ?? '')
const postBrand = computed(() => ({
  name: siteName.value,
  logoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || null,
}))

const { data, error } = await useAsyncData(
  () => `public-post-${siteId}-${slug.value}-${locale.value}`,
  async () => {
    let post: PublicPost | null | undefined
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
      const [{ cloudflareEnv }, { getPublishedPostBySlug }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/post-management'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.DB
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      post = await getPublishedPostBySlug(db, siteId, slug.value, env, locale.value) as PublicPost | null
    } else {
      const payload = await publicApiRequest<{ post: PublicPost }>(
        `/api/public/sites/${siteId}/posts/${encodeURIComponent(slug.value)}`,
        { query: locale.value !== 'en' ? { locale: locale.value } : undefined, validate: isPublicPostResponse },
      )
      post = payload.post
    }
    if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    return { post }
  },
)

if (error.value) throw error.value

const post = computed(() => data.value?.post ?? null)
const coverMedia = computed(() => post.value?.media.find(item => item.slot === 'cover') || post.value?.media[0] || null)
const pagePath = computed(() => post.value?.public_path || `/posts/${slug.value}`)
const seoTitle = computed(() => post.value?.seo_title || post.value?.title || `Update from ${siteName.value}`)
const seoDescription = computed(() => post.value?.seo_description || post.value?.summary || post.value?.body || `Latest update from ${siteName.value}.`)
const { canonicalUrl, ogImageUrl } = useSocialMetadata(() => ({
  path: post.value?.canonical_url || pagePath.value,
  title: seoTitle.value,
  description: seoDescription.value,
  pageType: 'article',
  brand: { siteName: siteName.value, logoUrl: publicSite.value?.media.find(item => item.slot === 'logo')?.public_url || null },
  heroImage: coverMedia.value
    ? { url: coverMedia.value.public_url, kind: coverMedia.value.kind, thumbnailUrl: coverMedia.value.thumbnail_url }
    : null,
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
