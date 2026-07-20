<template>
  <main v-if="post" class="min-h-screen bg-default text-default">
    <SayaPostDetail :post="post" />
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

interface PublicPostMedia {
  id?: string
  mediaAssetId?: string
  url: string
  kind: 'image' | 'video'
  alt?: string | null
}

interface PublicPost {
  id: string
  slug: string
  title: string
  body: string
  summary: string
  createTime: string | null
  publicPath: string
  public_path: string
  canonicalUrl: string | null
  canonical_url: string | null
  seo_title?: string | null
  seo_description?: string | null
  cover?: PublicPostMedia | null
  media: PublicPostMedia[]
  gallery: PublicPostMedia[]
  callToAction?: { actionType: string | null; url: string } | null
  event?: { title: string | null; startDate: string | null; endDate: string | null } | null
  offer?: { title: string | null; couponCode: string | null; terms: string | null } | null
  location?: { id: string; title: string | null; slug: string | null } | null
}

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.brand_name || 'KrabiClaw')

const { data, error } = await useAsyncData(
  () => `public-post-${siteId}-${slug.value}`,
  async () => {
    let post: PublicPost | null | undefined
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
      const [{ cloudflareEnv }, { getPublishedPostBySlug }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/post-management'),
      ])
      const env = cloudflareEnv(requestEvent)
      const db = env.DB
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      post = await getPublishedPostBySlug(db, siteId, slug.value, env) as PublicPost | null
    } else {
      const payload = await $fetch<{ post?: PublicPost }>(`/api/public/sites/${siteId}/posts/${encodeURIComponent(slug.value)}`)
      post = payload.post
    }
    if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    return { post }
  },
)

if (error.value) throw error.value

const post = computed(() => data.value?.post ?? null)
const coverMedia = computed(() => post.value?.cover || post.value?.media?.[0] || null)
const pagePath = computed(() => post.value?.public_path || post.value?.publicPath || `/posts/${slug.value}`)
const canonicalUrl = useSeoUrl(() => post.value?.canonical_url || post.value?.canonicalUrl || pagePath.value)
const seoTitle = computed(() => post.value?.seo_title || post.value?.title || `Update from ${siteName.value}`)
const seoDescription = computed(() => post.value?.seo_description || post.value?.summary || post.value?.body || `Latest update from ${siteName.value}.`)
const ogImage = useSeoUrl(() => coverMedia.value?.url || undefined)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: () => siteName.value,
  ogImage: () => ogImage.value,
  ogUrl: canonicalUrl,
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  twitterImage: () => ogImage.value,
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
}))

useSchemaOrg([
  computed(() => ({
    '@type': 'Article',
    headline: seoTitle.value,
    description: seoDescription.value,
    datePublished: post.value?.createTime,
    image: coverMedia.value?.url,
    url: canonicalUrl.value,
    author: { '@type': 'Organization', name: siteName.value },
    publisher: { '@type': 'Organization', name: siteName.value },
  })),
])
</script>
