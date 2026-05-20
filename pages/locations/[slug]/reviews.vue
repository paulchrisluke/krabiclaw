<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Loading -->
    <template v-if="pending">
      <div class="mx-auto max-w-2xl px-4 py-20 text-center">
        <USkeleton class="mx-auto h-24 w-48 rounded-lg" />
      </div>
    </template>

    <template v-else-if="location">
      <!-- Sub-nav (Level 2) -->
      <SayaSubNav 
        :location-slug="slug" 
        active="reviews" 
      />

      <!-- Compact Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 lg:px-8 text-center">
        <NuxtLink :to="`/locations/${slug}`" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← Back to {{ location?.title }}
        </NuxtLink>
        
        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">What guests are <em class="saya-italic">saying</em></h1>
          <p class="text-sm text-muted">
            {{ location?.title }}
          </p>
        </div>
      </header>
      <!-- Aggregate band — only shown when there are actual reviews -->
      <section v-if="reviews.length > 0" class="border-b border-default border-t bg-elevated">
        <div class="mx-auto grid max-w-7xl items-center gap-20 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
          <!-- Big score -->
          <div>
            <div class="saya-display saya-italic text-default" style="font-size: clamp(72px, 10vw, 96px); line-height: 0.9; letter-spacing: -0.03em">
              {{ aggregate?.rating ? Number(aggregate.rating).toFixed(1) : '—' }}
            </div>
            <div class="mt-3 flex gap-1">
              <UIcon
                v-for="s in 5"
                :key="s"
                name="i-heroicons-star-solid"
                class="size-5"
                :class="s <= Math.round(aggregate?.rating ?? 0) ? 'text-primary' : 'text-muted'"
              />
            </div>
            <p class="mt-4 text-sm text-default">Based on {{ aggregate?.review_count?.toLocaleString() ?? 0 }} reviews</p>
            <p class="mt-1 text-xs tracking-wide text-muted">Synced live from Google Business</p>
          </div>

          <!-- Star distribution -->
          <div class="flex flex-col gap-2.5">
            <div v-for="star in [5, 4, 3, 2, 1]" :key="star" class="grid grid-cols-[40px_1fr_36px] items-center gap-4">
              <div class="flex items-center gap-1 text-sm text-muted">
                {{ star }}
                <UIcon name="i-heroicons-star-solid" class="size-3 text-primary" />
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-500"
                  :style="`width: ${barPct(star)}%`"
                />
              </div>
              <div class="text-right tabular-nums text-sm text-muted">{{ distCount(star) }}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Filter chips — only shown when there are reviews to filter -->
      <SayaFilterTabs
        v-if="reviews.length > 0"
        v-model="activeFilter"
        :tabs="filters"
      >
        <template #extra>
          <span class="ml-auto text-[10px] tabular-nums text-muted/50">{{ filtered.length }} reviews</span>
        </template>
      </SayaFilterTabs>

      <!-- Review list -->
      <section class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <!-- True empty: no reviews at all -->
        <div v-if="reviews.length === 0" class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-default py-20 text-center">
          <div class="flex size-14 items-center justify-center rounded-full bg-elevated text-muted">
            <UIcon name="i-heroicons-star" class="size-7" />
          </div>
          <div class="mt-6 saya-display saya-italic text-3xl text-default">No reviews yet.</div>
          <p class="mt-2 max-w-sm text-sm text-muted">Be the first to share your experience with us on Google.</p>
        </div>

        <!-- Has reviews but active filter hides them -->
        <div v-else-if="filtered.length === 0" class="rounded-3xl border border-dashed border-default p-14 text-center">
          <div class="saya-display saya-italic text-2xl text-default">No reviews match this filter.</div>
          <p class="mt-2 text-sm text-muted">Switch filter, or read all reviews.</p>
          <button
            class="mt-6 rounded-full border border-default px-5 py-2.5 text-sm transition hover:bg-muted"
            @click="activeFilter = 'recent'"
          >
            Reset filter
          </button>
        </div>

        <div v-else class="flex flex-col gap-8">
          <article
            v-for="review in filtered"
            :key="review.id"
            class="rounded-3xl border border-default bg-default p-8 sm:p-9"
          >
            <!-- Reviewer header -->
            <div class="mb-5 flex items-start gap-4">
              <AppAvatar
                :src="review.reviewer_photo_url"
                :name="review.author_name"
                size="md"
              />
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-default">{{ review.author_name }}</span>
                  <UBadge v-if="review.source === 'gmb'" variant="outline" size="xs">via Google</UBadge>
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <div class="flex gap-0.5">
                    <UIcon
                      v-for="s in 5"
                      :key="s"
                      name="i-heroicons-star-solid"
                      class="size-3"
                      :class="s <= review.rating ? 'text-primary' : 'text-muted'"
                    />
                  </div>
                  <span class="text-muted">·</span>
                  <span class="text-xs text-muted">{{ formatDate(review.created_at) }}</span>
                </div>
              </div>
            </div>

            <div v-if="review.title" class="saya-display saya-italic mb-2 text-2xl text-default leading-tight">
              {{ review.title }}
            </div>
            <p class="text-sm leading-relaxed text-default">{{ review.content }}</p>

            <!-- Photos -->
            <div v-if="review.photo_urls?.length" class="mt-5 flex flex-wrap gap-2">
              <div
                v-for="(url, i) in review.photo_urls"
                :key="i"
                class="size-28 overflow-hidden rounded-xl bg-muted"
              >
                <img
                  v-if="!failedPhotoIndices[`${review.id}-${i}`]"
                  :src="url"
                  alt=""
                  class="h-full w-full object-cover"
                  @error="handleReviewImageError(review.id, i)"
                >
              </div>
            </div>

            <!-- Owner reply -->
            <div
              v-if="review.owner_reply"
              class="mt-6 rounded-2xl border-l-4 border-primary bg-elevated p-5"
            >
              <div class="mb-2 flex items-center gap-3">
                <UBadge color="neutral" size="xs" class="font-semibold">{{ siteName }}</UBadge>
                <span class="text-xs text-muted">Owner response · {{ formatDate(review.owner_reply_at) }}</span>
              </div>
              <p class="text-sm leading-relaxed text-default">{{ review.owner_reply }}</p>
            </div>
          </article>
        </div>
      </section>

      <!-- Write review CTA -->
      <section class="bg-inverted text-inverted">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-12 px-4 py-18 sm:px-6 lg:px-8">
          <div>
            <p class="saya-eyebrow mb-4 text-white/60">Eaten with us recently?</p>
            <h3 class="saya-display saya-italic text-5xl text-white leading-none">Leave a review on Google.</h3>
            <p class="mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
              It shows up here automatically within 24 hours. Honest words help us — and the next guest deciding where to eat.
            </p>
          </div>
          <a
            v-if="location?.gmb_review_url"
            :href="location.gmb_review_url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center rounded-full bg-white px-8 py-4 text-xs font-medium uppercase tracking-widest text-black no-underline transition hover:bg-zinc-100"
          >
            Write a review →
          </a>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.name || 'Saya')

const { location, reviewsAggregate, reviewsList, data: bootstrapData } = useBootstrap()
const pending = computed(() => !bootstrapData.value)
const aggregate = reviewsAggregate
const reviews = reviewsList

const filters = [
  { key: 'recent', label: 'Most recent' },
  { key: 'highest', label: 'Highest rated' },
  { key: 'lowest', label: 'Lowest rated' },
  { key: 'photos', label: 'With photos' }
]
const activeFilter = ref('recent')

const filtered = computed(() => {
  let list = [...reviews.value]
  if (activeFilter.value === 'highest') list.sort((a, b) => b.rating - a.rating)
  else if (activeFilter.value === 'lowest') list.sort((a, b) => a.rating - b.rating)
  else if (activeFilter.value === 'photos') list = list.filter(r => r.photo_urls?.length)
  else {
    const ts = (value: ApiValue) => {
      if (typeof value !== 'string' || !value) return 0
      const parsed = Date.parse(value)
      return Number.isNaN(parsed) ? 0 : parsed
    }
    list.sort((a, b) => ts(b.created_at) - ts(a.created_at))
  }
  return list
})

const maxBarCount = computed(() =>
  Math.max(...(aggregate.value?.distribution ?? []).map((d: ApiValue) => d.count), 1)
)
function barPct(star: number) {
  const row = aggregate.value?.distribution?.find((d: ApiValue) => d.star === star)
  return row ? (row.count / maxBarCount.value) * 100 : 0
}
function distCount(star: number) {
  return aggregate.value?.distribution?.find((d: ApiValue) => d.star === star)?.count ?? 0
}

const failedPhotoIndices = ref<Record<string, boolean>>({})

function handleReviewImageError(reviewId: string | number, index: string | number) {
  failedPhotoIndices.value[`${String(reviewId)}-${String(index)}`] = true
}

function formatDate(ts: string | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}


useSeoMeta({
  title: () => `Reviews · ${location.value?.title || slug.value}`,
  description: () => `Guest reviews for ${location.value?.title} at ${siteName.value}.`,
  ogImage: useSharedOgImage(),
  ogUrl: useSeoUrl(() => `/locations/${slug.value}/reviews`)
})

useSchemaOrg([
  computed(() => ({
    '@type': ['Restaurant', 'LocalBusiness'],
    name: `${siteName.value} — ${location.value?.title ?? ''}`,
    ...(aggregate.value?.rating ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: aggregate.value.rating,
        reviewCount: aggregate.value.review_count ?? 0
      }
    } : {}),
    review: reviews.value.slice(0, 10).map((r: ApiValue) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author_name },
      datePublished: r.created_at,
      reviewBody: r.content,
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 }
    }))
  })),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: '/locations' },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Reviews', item: `/locations/${slug.value}/reviews` }
    ]
  }))
])
</script>
