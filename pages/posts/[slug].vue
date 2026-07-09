<template>
  <main v-if="post" class="min-h-screen bg-default text-default">
    <article class="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      <NuxtLink to="/posts" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
        Back to updates
      </NuxtLink>

      <div class="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.65fr)] lg:items-start">
        <div class="space-y-5">
          <div v-if="coverMedia" class="overflow-hidden rounded-2xl bg-muted">
            <video
              v-if="coverMedia.kind === 'video'"
              :src="coverMedia.url"
              autoplay
              muted
              loop
              playsinline
              class="aspect-4/5 w-full object-cover sm:aspect-video"
            />
            <img
              v-else
              :src="coverMedia.url"
              :alt="coverMedia.alt || post.title || 'Post image'"
              class="aspect-4/5 w-full object-cover sm:aspect-video"
            />
          </div>

          <div v-if="galleryMedia.length > 0" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div
              v-for="item in galleryMedia"
              :key="item.id || item.url"
              class="overflow-hidden rounded-xl bg-muted"
            >
              <video
                v-if="item.kind === 'video'"
                :src="item.url"
                muted
                playsinline
                preload="metadata"
                class="aspect-square w-full object-cover"
              />
              <img
                v-else
                :src="item.url"
                :alt="item.alt || post.title || 'Post gallery image'"
                class="aspect-square w-full object-cover"
              />
            </div>
          </div>
        </div>

        <div class="space-y-8 lg:sticky lg:top-8">
          <header>
            <time v-if="post.createTime" :datetime="post.createTime" class="saya-kicker text-muted">
              {{ formatDate(post.createTime) }}
            </time>
            <h1 class="mt-4 saya-display-md text-default">
              <em class="saya-italic">{{ post.title || 'Update' }}</em>
            </h1>
            <p v-if="post.location" class="mt-3 text-sm text-muted">
              {{ post.location.title }}
            </p>
          </header>

          <div class="whitespace-pre-line text-base leading-8 text-muted">
            {{ post.summary || post.body }}
          </div>

          <div v-if="post.event || post.offer" class="space-y-3 border-y border-default py-5 text-sm">
            <div v-if="post.event">
              <p class="saya-kicker text-muted">Event</p>
              <p class="mt-1 font-semibold text-default">{{ post.event.title }}</p>
              <p v-if="post.event.startDate" class="text-muted">{{ formatDate(post.event.startDate) }}</p>
            </div>
            <div v-if="post.offer">
              <p class="saya-kicker text-muted">Offer</p>
              <p class="mt-1 font-semibold text-default">{{ post.offer.title }}</p>
              <p v-if="post.offer.couponCode" class="text-muted">Code {{ post.offer.couponCode }}</p>
              <p v-if="post.offer.terms" class="mt-1 text-muted">{{ post.offer.terms }}</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <NuxtLink
              v-if="post.callToAction?.url"
              :to="post.callToAction.url"
              class="inline-flex items-center justify-center rounded bg-(--brand-color) px-5 py-3 text-sm font-semibold text-white no-underline transition hover:opacity-90"
            >
              {{ formatCta(post.callToAction.actionType) }}
            </NuxtLink>
            <NuxtLink
              v-if="post.location?.slug"
              :to="`/locations/${post.location.slug}`"
              class="inline-flex items-center justify-center rounded border border-default px-5 py-3 text-sm font-semibold text-default no-underline transition hover:bg-muted"
            >
              View location
            </NuxtLink>
          </div>
        </div>
      </div>
    </article>
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
const galleryMedia = computed(() => {
  const gallery = post.value?.gallery ?? []
  const media = post.value?.media ?? []
  const coverId = coverMedia.value?.id || coverMedia.value?.mediaAssetId
  if (gallery.length) return gallery
  return media.filter(item => item.id !== coverId && item.mediaAssetId !== coverId)
})
const pagePath = computed(() => post.value?.public_path || post.value?.publicPath || `/posts/${slug.value}`)
const canonicalUrl = useSeoUrl(() => post.value?.canonical_url || post.value?.canonicalUrl || pagePath.value)
const seoTitle = computed(() => post.value?.seo_title || post.value?.title || `Update from ${siteName.value}`)
const seoDescription = computed(() => post.value?.seo_description || post.value?.summary || post.value?.body || `Latest update from ${siteName.value}.`)
const ogImage = useSeoUrl(() => coverMedia.value?.url || undefined)

const { formatDate } = useLocaleDate()

function formatCta(value: string | null | undefined) {
  return (value || 'Learn more').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (char) => char.toUpperCase())
}

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
