<template>
  <div class="min-h-screen bg-default text-default">
    <section class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <NuxtLink :to="`/locations/${slug}/reviews`" class="saya-kicker text-muted no-underline hover:text-default">
        Back to reviews
      </NuxtLink>

      <div v-if="pending" class="mt-12 rounded-lg border border-default p-8">
        <div class="h-6 w-48 animate-pulse rounded bg-elevated" />
        <div class="mt-5 h-32 animate-pulse rounded bg-elevated" />
      </div>

      <div v-else-if="!review" class="mt-12 rounded-lg border border-default p-8">
        <h1 class="text-2xl font-semibold">Review not found</h1>
      </div>

      <article v-else class="mt-12">
        <div class="flex gap-1">
          <SayaIcon v-for="star in 5" :key="star" name="star" solid class="size-5" :class="star <= Number(review.rating) ? 'text-primary' : 'text-muted'" />
        </div>
        <h1 class="mt-5 text-4xl font-semibold leading-tight">{{ review.title || `${review.rating}-star review` }}</h1>
        <p class="mt-3 text-sm text-muted">
          {{ review.author_name || 'Guest' }} / {{ formatDate(String(review.created_at)) }}
        </p>
        <p class="mt-8 whitespace-pre-line text-base leading-8">{{ review.content }}</p>

        <div v-if="mediaItems.length" class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <button
            v-for="(item, index) in mediaItems"
            :key="item.id || index"
            type="button"
            class="aspect-square overflow-hidden rounded-lg bg-elevated"
            @click="openLightbox(index)"
          >
            <img :src="item.thumbnail_url || item.public_url" :alt="item.alt_text || ''" class="h-full w-full object-cover">
          </button>
        </div>

        <div v-if="review.owner_reply" class="mt-10 rounded-lg border-l-4 border-primary bg-elevated p-5">
          <p class="text-sm font-medium">{{ review.site_name }}</p>
          <p class="mt-3 whitespace-pre-line text-sm leading-7 text-muted">{{ review.owner_reply }}</p>
        </div>

        <div class="mt-10 flex flex-wrap items-center gap-3">
          <SayaButton variant="soft" @click="markHelpful">
            Helpful / {{ helpfulCount }}
          </SayaButton>
          <SayaButton variant="outline" @click="shareReview">
            Share
          </SayaButton>
        </div>
      </article>
    </section>

    <SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIndex" :items="lightboxItems" :title="review?.title || 'Review media'" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const reviewId = computed(() => String(route.params.reviewId))
const { formatDate } = useLocaleDate()

const { data: review, pending } = await useAsyncData<ApiRecord | null>(
  () => `review-${slug.value}-${reviewId.value}`,
  async () => {
    // Fetch directly against the real request's D1 binding instead of doing a nested
    // self-fetch back to our own API — Nitro's internal dispatch doesn't reliably
    // reproduce the same route-param/binding resolution as a real external request,
    // which caused pages/blog/[category]/[slug].vue and pages/docs/[...segments].vue
    // to 404/500 on records their own API served correctly. Same fix applied here.
    if (import.meta.server) {
      const requestEvent = useRequestEvent()
      if (!requestEvent) return null

      const [{ cloudflareEnv }, { getPublicReview }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/review-management'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })

      return await getPublicReview(db, String(siteId), slug.value, reviewId.value) as ApiRecord | null
    }

    const endpoint = `/api/public/sites/${siteId}/locations/${slug.value}/reviews/${reviewId.value}`
    const response = await $fetch<{ review?: ApiRecord }>(endpoint)
    return response?.review ?? null
  },
  { watch: [slug, reviewId] },
)
const helpfulCount = ref(0)
watchEffect(() => {
  helpfulCount.value = Number(review.value?.helpful_count ?? 0)
})

const mediaItems = computed(() => ((review.value?.media as ApiRecord[] | undefined) ?? []).filter((item) => item.public_url))
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const lightboxItems = computed(() => mediaItems.value.map((item) => ({
  url: String(item.public_url),
  kind: (item.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
  alt: String(item.alt_text || ''),
})))

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

async function markHelpful() {
  const result = await $fetch<{ helpful: boolean; helpfulCount: number }>(`/api/public/sites/${siteId}/locations/${slug.value}/reviews/${reviewId.value}/helpful`, { method: 'POST' })
  helpfulCount.value = result.helpfulCount
}

async function shareReview() {
  if (!import.meta.client) return
  const url = window.location.href
  if (navigator.share) {
    await navigator.share({ title: String(review.value?.title || 'Review'), url }).catch(() => undefined)
    return
  }
  await navigator.clipboard?.writeText(url)
}

useSeoMeta({
  title: () => review.value ? `${review.value.rating}-star review from ${review.value.author_name || 'Guest'}` : 'Review',
  description: () => String(review.value?.content || '').slice(0, 150),
})

useHead(() => review.value ? {
  script: [{
    type: 'application/ld+json',
    children: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Review',
      author: { '@type': 'Person', name: review.value.author_name || 'Guest' },
      reviewRating: { '@type': 'Rating', ratingValue: review.value.rating, bestRating: 5 },
      reviewBody: review.value.content,
      itemReviewed: { '@type': 'LocalBusiness', name: review.value.site_name },
    }),
  }],
} : {})
</script>
