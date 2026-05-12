<template>
  <div class="min-h-screen bg-default text-default">

    <nav class="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <UBreadcrumb :items="breadcrumb" />
    </nav>

    <!-- Page header -->
    <header class="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ location?.title }}</p>
      <h1 class="saya-display-lg text-default">
        What guests are <em class="saya-italic">saying</em>
      </h1>
    </header>

    <SayaSubNav :location-slug="slug" active="reviews" :review-count="aggregate?.review_count" />

    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-2xl px-4 py-20 text-center">
      <USkeleton class="mx-auto h-24 w-48 rounded-lg" />
    </div>

    <template v-else>
      <!-- Aggregate band -->
      <section class="border-b border-default border-t bg-elevated">
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

      <!-- Filter chips -->
      <div class="sticky top-16 z-30 border-b border-default bg-default">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-5 sm:px-6 lg:px-8">
          <span class="saya-eyebrow text-muted">Filter</span>
          <button
            v-for="f in filters"
            :key="f.key"
            :class="[
              'rounded-full border px-4 py-2 text-sm transition-colors',
              activeFilter === f.key
                ? 'border-default bg-default text-inverted'
                : 'border-default bg-default text-default hover:border-muted'
            ]"
            @click="activeFilter = f.key"
          >
            {{ f.label }}
          </button>
          <span class="ml-auto text-sm text-muted">{{ filtered.length }} of {{ reviews.length }}</span>
        </div>
      </div>

      <!-- Review list -->
      <section class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div v-if="filtered.length === 0" class="rounded-3xl border border-dashed border-default p-14 text-center">
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
              <UAvatar
                :src="review.reviewer_photo_url"
                :alt="review.author_name"
                :ui="{ fallback: 'bg-primary text-white text-sm font-semibold' }"
                size="md"
              >
                <template v-if="!review.reviewer_photo_url" #fallback>
                  {{ initials(review.author_name) }}
                </template>
              </UAvatar>
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
                <img :src="url" alt="" class="h-full w-full object-cover" >
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
            :href="location?.gmb_review_url || '#'"
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
const siteName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')

const { data: locData } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `loc-reviews-loc-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (locData as any).value?.location ?? null)

const { data, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}/reviews`,
  { key: () => `loc-reviews-${siteId}-${slug.value}`, default: () => ({ aggregate: null, reviews: [] }) }
)

const aggregate = computed(() => (data as any).value?.aggregate ?? null)
const reviews = computed(() => (data as any).value?.reviews ?? [])

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
  else list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return list
})

const maxBarCount = computed(() =>
  Math.max(...(aggregate.value?.distribution ?? []).map((d: any) => d.count), 1)
)
function barPct(star: number) {
  const row = aggregate.value?.distribution?.find((d: any) => d.star === star)
  return row ? (row.count / maxBarCount.value) * 100 : 0
}
function distCount(star: number) {
  return aggregate.value?.distribution?.find((d: any) => d.star === star)?.count ?? 0
}

function initials(name: string) {
  return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
}
function formatDate(ts: string | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

const breadcrumb = computed(() => [
  { label: siteName.value, to: '/' },
  { label: 'Locations', to: '/locations' },
  { label: location.value?.title || slug.value, to: `/locations/${slug.value}` },
  { label: 'Reviews' }
])

useSeoMeta({
  title: () => `Reviews · ${location.value?.title || slug.value}`,
  description: () => `Guest reviews for ${location.value?.title} at ${siteName.value}.`,
  ogUrl: () => `/locations/${slug.value}/reviews`
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
    review: reviews.value.slice(0, 10).map((r: any) => ({
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
