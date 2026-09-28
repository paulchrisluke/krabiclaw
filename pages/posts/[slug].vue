<template>
  <SocialPostDetail v-if="post" :post="post" :brand="postBrand" />
</template>

<script setup lang="ts">
import SocialPostDetail from '~/components/social/SocialPostDetail.vue'
import { isPublicSocialPost, type PublicSocialPost } from '~/utils/public-resource-contracts'
import { publicApiRequest, isRecord } from '~/utils/api-clients'

definePageMeta({ middleware: 'template-layout' })

type DetailPost = PublicSocialPost & { localeRepresentations: Array<{ locale: string; label: string; route_path: string; source: 'source' | 'localized' }> }

const isPublicPostResponse = (value: unknown): value is { post: DetailPost } =>
  isRecord(value) && isPublicSocialPost(value.post) && Array.isArray((value.post as unknown as Record<string, unknown>).localeRepresentations)

const route = useRoute()
const requestEvent = useRequestEvent()
const { organizationId, organization, isPlatform, previewAuthorized } = useTenantOrganization()
if (!organizationId) throw createError({ statusCode: 404 })
const { organization: publicOrganization } = useOrganizationShellState()
const { locale } = useI18n()

const slug = computed(() => String(route.params.slug))
const organizationName = computed(() => organization?.name?.trim() ?? '')
const logoUrl = computed(() => publicOrganization.value?.media.find(item => item.slot === 'logo')?.public_url || null)
const postBrand = computed(() => ({ name: organizationName.value, logoUrl: logoUrl.value }))

// One reader for the server render and client navigation: the SSR path calls
// it directly and the client asks the public API, which calls the same one.
const { data, error } = await useAsyncData(
  () => `public-post-${organizationId}-${locale.value}-${slug.value}-${previewAuthorized ? 'preview' : 'published'}`,
  async () => {
    let post: DetailPost | null
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { getPublicSocialPost }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/post-management'),
      ])
      const env = cloudflareEnv(requestEvent)
      if (!env.DB) throw createError({ statusCode: 503, statusMessage: 'Database not available' })
      post = await getPublicSocialPost(env, env.DB, organizationId, slug.value, locale.value, previewAuthorized)
    } else {
      post = (await publicApiRequest<{ post: DetailPost }>(`/api/public/posts/${encodeURIComponent(slug.value)}`, {
        query: { locale: locale.value }, validate: isPublicPostResponse,
      })).post
    }
    if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    return { post }
  },
)
if (error.value) throw error.value
useState<DetailPost['localeRepresentations']>('public-locale-representations', () => []).value = data.value?.post.localeRepresentations ?? []

const post = computed(() => data.value?.post ?? null)
// A post without a title is described by its own words, and titled by the
// business that wrote it; nothing is invented for it.
const seoTitle = computed(() => post.value?.title || post.value?.body?.split('\n').find(line => line.trim())?.slice(0, 70) || organizationName.value)
const seoDescription = computed(() => post.value?.body || post.value?.title || '')
const { canonicalUrl, ogImageUrl } = useSocialMetadata(() => ({
  path: post.value?.url || post.value?.path || `/posts/${slug.value}`,
  // A tenant's page names the business, as its other pages do; Krabiclaw's template adds its own name.
  title: isPlatform || seoTitle.value === organizationName.value ? seoTitle.value : `${seoTitle.value} | ${organizationName.value}`,
  description: seoDescription.value,
  pageType: 'article',
  brand: { organizationName: organizationName.value },
  socialImage: post.value?.social_image ?? null,
  publishedAt: post.value?.published_at || null,
  discoverability: post.value?.status === 'draft' ? 'private' : post.value?.visibility,
}))

useSchemaOrg([
  computed(() => ({
    '@type': 'Article',
    headline: seoTitle.value,
    description: seoDescription.value,
    datePublished: post.value?.published_at,
    image: ogImageUrl.value,
    url: canonicalUrl.value,
    author: { '@type': 'Organization', name: organizationName.value },
    publisher: { '@type': 'Organization', name: organizationName.value, logo: logoUrl.value ? { '@type': 'ImageObject', url: logoUrl.value } : undefined },
  })),
])
</script>
