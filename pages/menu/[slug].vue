<template>
  <div class="min-h-screen bg-default">
    <AppBreadcrumb v-if="item" :crumbs="[
      { to: '/', label: 'Home' },
      { to: '/menu', label: 'Menu' },
      ...(category?.name ? [{ to: '/menu', label: category.name }] : []),
      { to: `/menu/${item?.slug}`, label: item?.name }
    ]" />

    <!-- Item Details -->
    <article v-if="item" class="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
      <div class="lg:grid lg:auto-rows-min lg:grid-cols-12 lg:gap-x-10">
        <section class="lg:col-span-5 lg:col-start-8">
          <p class="text-sm font-medium text-muted">{{ category?.name }}</p>
          <div class="mt-2 flex items-start justify-between gap-6">
            <h1 class="text-2xl font-semibold leading-tight text-highlighted md:text-4xl">{{ item.name }}</h1>
            <div class="shrink-0 flex items-baseline gap-2">
              <span v-if="isOnSale" class="text-base text-muted line-through">{{ compareAtPrice }}</span>
              <p class="text-2xl font-semibold text-highlighted">{{ formattedPrice }}</p>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-2">
            <span
              :class="[
                'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
                item.available ? 'bg-elevated text-default' : 'bg-red-50 text-red-700'
              ]"
            >
              {{ item.available ? 'Available today' : 'Currently unavailable' }}
            </span>
            <span class="inline-flex items-center rounded-full bg-elevated px-3 py-1 text-sm font-medium text-default">
              {{ category?.name }}
            </span>
            <span v-if="isRobatayaki" class="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800">
              Charcoal grilled
            </span>
          </div>
        </section>

        <section class="mt-8 lg:col-span-7 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:mt-0" aria-labelledby="item-images-heading">
          <h2 id="item-images-heading" class="sr-only">Dish images</h2>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-1 lg:gap-6">
            <div class="overflow-hidden rounded-lg bg-default">
              <video
                v-if="mainMedia.isVideo"
                :src="mainMedia.url ?? undefined"
                autoplay
                muted
                loop
                playsinline
                class="aspect-4/3 w-full object-cover"
              />
              <img
                v-else-if="mainMedia.url"
                :src="mainMedia.url"
                :alt="item.name"
                class="aspect-4/3 w-full object-cover"
              />
              <div v-else class="flex aspect-4/3 w-full items-center justify-center px-6 text-center bg-muted">
                <span class="text-sm text-dimmed">No image available yet</span>
              </div>
            </div>
          </div>
        </section>

        <section class="mt-8 lg:col-span-5" aria-labelledby="item-details-heading">
          <h2 id="item-details-heading" class="sr-only">Dish details</h2>

          <div>
            <h3 class="text-sm font-medium text-highlighted">Description</h3>
            <p class="mt-4 text-sm leading-6 text-muted">{{ item.description }}</p>
            <p v-if="item.preparation" class="mt-4 text-sm leading-6 text-muted">{{ item.preparation }}</p>
          </div>

          <div class="mt-8 border-t border-default pt-8">
            <h3 class="text-sm font-medium text-highlighted">Menu details</h3>
            <dl class="mt-4 divide-y divide-gray-100 text-sm leading-6">
              <div class="flex justify-between gap-4 py-3">
                <dt class="text-muted">Category</dt>
                <dd class="text-right font-medium text-highlighted">{{ category?.name }}</dd>
              </div>
              <div class="flex justify-between gap-4 py-3">
                <dt class="text-muted">Price</dt>
                <dd class="text-right font-medium text-highlighted">{{ formattedPrice }}</dd>
              </div>
              <div class="flex justify-between gap-4 py-3">
                <dt class="text-muted">Availability</dt>
                <dd class="text-right font-medium text-highlighted">{{ item.available ? 'Available' : 'Not available' }}</dd>
              </div>
              <div class="flex justify-between gap-4 py-3">
                <dt class="text-muted">Allergens</dt>
                <dd class="text-right font-medium text-highlighted">{{ visibleAllergensLabel }}</dd>
              </div>
            </dl>
          </div>

          <div v-if="detailSections.length > 0" class="mt-8 border-t border-default pt-8">
            <div v-for="section in detailSections" :key="section.name" class="mt-6 first:mt-0">
              <h3 class="text-sm font-medium text-highlighted">{{ section.name }}</h3>
              <ul role="list" class="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-muted marker:text-dimmed">
                <li v-for="entry in section.items" :key="entry" class="pl-2">{{ entry }}</li>
              </ul>
            </div>
          </div>

          <div class="mt-8">
            <SayaButton to="/menu" variant="outline">
              Back to Menu
            </SayaButton>
          </div>
        </section>
      </div>

      <!-- ... -->
      <section aria-labelledby="reviews-heading" class="mt-16 border-t border-default pt-12 sm:mt-24">
        <div class="flex items-center justify-between gap-6">
          <h2 id="reviews-heading" class="text-lg font-medium text-highlighted">Guest reviews</h2>
          <p v-if="reviewSummary" class="text-sm text-muted">
            {{ reviewSummary.average }} out of 5
          </p>
        </div>

        <div v-if="reviewsLoading" class="mt-6 space-y-8 divide-y divide-gray-200 border-y border-default py-8">
          <div v-for="i in 2" :key="i" class="animate-pulse lg:grid lg:grid-cols-12 lg:gap-x-8">
            <div class="lg:col-span-3">
              <div class="h-4 w-24 rounded bg-muted"></div>
              <div class="mt-2 h-3 w-32 rounded bg-muted"></div>
            </div>
            <div class="mt-4 lg:col-span-9 lg:mt-0">
              <div class="h-4 w-48 rounded bg-muted"></div>
              <div class="mt-3 h-20 w-full rounded bg-muted"></div>
            </div>
          </div>
        </div>

        <div v-else-if="reviews.length > 0" class="mt-6 divide-y divide-gray-200 border-y border-default">
          <article v-for="review in reviews" :key="review.id || review.author" class="py-8 lg:grid lg:grid-cols-12 lg:gap-x-8">
            <div class="lg:col-span-3">
              <p class="font-medium text-highlighted">{{ review.author }}</p>
              <time v-if="reviewDateTime(review)" :datetime="reviewDateTime(review)" class="mt-1 block text-sm text-muted">
                <template v-if="review.date">{{ review.date }}</template>
                <NuxtTime v-else-if="review.createdAt" :datetime="review.createdAt" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
              </time>
            </div>
            <div class="mt-4 lg:col-span-9 lg:mt-0">
              <p class="text-sm font-medium text-highlighted">{{ review.title }}</p>
              <p class="mt-3 text-sm leading-6 text-muted">{{ review.content }}</p>
            </div>
          </article>
        </div>

        <div v-else class="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-default bg-muted/30 py-16 text-center">
          <div class="flex size-12 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
            <SayaIcon name="chat-bubble-bottom-center-text" class="size-6" />
          </div>
          <h3 class="mt-4 text-sm font-medium text-highlighted">No reviews yet</h3>
          <p class="mt-1 text-sm text-muted">Have you tried this dish? Be the first to share your experience.</p>
          <div class="mt-6">
            <SayaButton variant="outline" size="md" @click="scrollToReviewForm">
              Write a review
            </SayaButton>
          </div>
        </div>
      </section>

      <section aria-labelledby="review-form-heading" class="mt-16 border-t border-default pt-12 sm:mt-24">
        <div class="grid gap-8 lg:grid-cols-12 lg:gap-x-10">
          <div class="lg:col-span-4">
            <h2 id="review-form-heading" class="text-lg font-medium text-highlighted">Share your experience</h2>
            <p class="mt-3 text-sm leading-6 text-muted">
              Reviews are checked before they appear on the menu page.
            </p>
          </div>
          <form class="space-y-5 lg:col-span-8" @submit.prevent="submitReview">
            <div class="grid gap-5 sm:grid-cols-2">
              <div>
                <label for="review-author" class="block text-sm font-medium text-highlighted">Name</label>
                <input
                  id="review-author"
                  v-model="reviewForm.author"
                  type="text"
                  required
                  maxlength="80"
                  class="mt-2 block w-full rounded-md bg-default px-3 py-2 text-base text-highlighted outline-solid outline-1 -outline-offset-1 outline-default placeholder:text-dimmed focus:outline-2 focus:-outline-offset-2 focus:outline-black"
                />
              </div>
              <div>
                <label for="review-rating" class="block text-sm font-medium text-highlighted">Rating</label>
                <select
                  id="review-rating"
                  v-model.number="reviewForm.rating"
                  class="mt-2 block w-full rounded-md bg-default px-3 py-2 text-base text-highlighted outline-solid outline-1 -outline-offset-1 outline-default focus:outline-2 focus:-outline-offset-2 focus:outline-black"
                >
                  <option v-for="rating in [5, 4, 3, 2, 1]" :key="rating" :value="rating">
                    {{ rating }} stars
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label for="review-title" class="block text-sm font-medium text-highlighted">Short title</label>
              <input
                id="review-title"
                v-model="reviewForm.title"
                type="text"
                required
                maxlength="120"
                class="mt-2 block w-full rounded-md bg-default px-3 py-2 text-base text-highlighted outline-solid outline-1 -outline-offset-1 outline-default placeholder:text-dimmed focus:outline-2 focus:-outline-offset-2 focus:outline-black"
              />
            </div>
            <div>
              <label for="review-content" class="block text-sm font-medium text-highlighted">Review</label>
              <textarea
                id="review-content"
                v-model="reviewForm.content"
                required
                minlength="10"
                maxlength="1200"
                rows="4"
                class="mt-2 block w-full rounded-md bg-default px-3 py-2 text-base text-highlighted outline-solid outline-1 -outline-offset-1 outline-default placeholder:text-dimmed focus:outline-2 focus:-outline-offset-2 focus:outline-black"
              />
            </div>

            <p v-if="reviewMessage" :class="['text-sm', reviewError ? 'text-red-600' : 'text-green-700']">
              {{ reviewMessage }}
            </p>
            <button
              type="submit"
              :disabled="reviewSubmitting"
              class="inline-flex w-full items-center justify-center rounded-md bg-black px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
            >
              {{ reviewSubmitting ? 'Submitting...' : 'Submit review' }}
            </button>
          </form>
        </div>
      </section>

      <section v-if="relatedItems.length > 0" aria-labelledby="related-heading" class="mt-16 border-t border-default pt-12 sm:mt-24">
        <h2 id="related-heading" class="text-lg font-medium text-highlighted">More from {{ category?.name }}</h2>
        <div class="mt-6 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="related in relatedItems"
            :key="related.id"
            :to="`/menu/${related.slug}`"
            class="group relative"
          >
            <div class="aspect-square overflow-hidden rounded-md bg-elevated">
              <img
                v-if="related.public_url && !related.public_url.includes('PLACEHOLDER')"
                :src="related.public_url"
                :alt="related.name"
                class="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                loading="lazy"
              />
              <div v-else class="flex h-full w-full items-center justify-center px-4 text-center">
                <span class="text-sm text-dimmed">No image yet</span>
              </div>
            </div>
            <div class="mt-4 flex justify-between gap-4">
              <div>
                <h3 class="text-sm font-medium text-highlighted">{{ related.name }}</h3>
                <p class="mt-1 text-sm text-muted">{{ related.description }}</p>
              </div>
              <p class="shrink-0 text-sm font-medium text-highlighted">{{ formatPrice(related) }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>
    </article>

    <!-- 404 State -->
    <div class="max-w-6xl mx-auto px-4 py-12 text-center" v-else>
      <h1 class="text-4xl font-bold text-highlighted mb-4">Menu Item Not Found</h1>
      <p class="text-lg text-default mb-6">The menu item you're looking for doesn't exist.</p>
      <NuxtLink 
        to="/menu" 
        class="inline-block bg-black text-white px-6 py-3 rounded-full font-semibold hover:bg-gray-800 transition-colors"
      >
        ← Back to Menu
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })
import AppBreadcrumb from '~/components/ui/AppBreadcrumb.vue'
import { formatMoneyAmount, isSaleActive } from '~/shared/money'
import {
  useBootstrapParams,
  useBootstrapKey,
  useBootstrapUrl,
} from '~/composables/useBootstrapParams'

const { resolveMedia } = useMedia()
const route = useRoute()
const { site, siteId, draftId } = useTenantSite()
const siteName = computed(() => site?.brand_name || 'KrabiClaw')

interface Review {
  id: string
  author: string
  rating: number
  title: string
  content: string
  date?: string
  createdAt?: string
  datetime?: string
}



interface MenuItemType {
  id: string
  slug: string
  name: string
  section?: string
  price_amount?: number | string | null
  compare_at_price_amount?: number | string | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  available: boolean
  public_url?: string
  kind?: string
  description?: string
  preparation?: string
  allergens?: string[]
  ingredients?: string[]
  dietary_notes?: string[]
  serving_note?: string
  reviews?: Review[]
  seo_title?: string | null
  seo_description?: string | null
  canonical_url?: string | null
  robots?: string | null
  og_image_public_url?: string | null
}

interface ReviewsResponse {
  reviews: Review[]
}

interface SubmitReviewResponse {
  message?: string
}

interface ReviewSubmitError {
  data?: {
    error?: string
  }
}

type MenuItemSchema = {
  '@type': 'MenuItem'
  name: string
  description?: string
  image?: string
  offers?: {
    '@type': 'Offer'
    price: string
    priceCurrency?: string
    availability: string
  }
  suitableForDiet: string[]
  additionalProperty?: PropertyValue[]
  aggregateRating?: {
    '@type': 'AggregateRating'
    ratingValue: string
    reviewCount: number
  }
  review?: Array<Record<string, unknown>>
}

type PropertyValue = {
  '@type': 'PropertyValue'
  name: string
  value: string
}

// Item already ships in the layout's single bootstrap payload (page=menu, menu=1) —
// look it up by slug instead of firing a second SSR round trip. useBootstrap() itself
// is lazy/non-blocking (fine for the layout's header/footer), but a missing item here
// must produce a real HTTP 404 for search engines, which requires blocking on the fetch
// during SSR — so this page awaits its own useAsyncData call against the exact same
// key/URL the layout uses, and Nuxt's key-based dedup collapses both to one request.
const params = useBootstrapParams()
const entityId = computed(() => siteId || draftId || null)
const bootstrapKey = computed(() => useBootstrapKey(entityId.value, params.value))
const bootstrapUrl = computed(() => useBootstrapUrl(siteId, params.value))
const requestFetch = useRequestFetch()

interface BootstrapMenuResponse {
  menu: ApiRecord | null
}

const { data, pending: _pending, error } = await useAsyncData<BootstrapMenuResponse>(
  bootstrapKey,
  () => (import.meta.server
    ? requestFetch<BootstrapMenuResponse>(bootstrapUrl.value)
    : $fetch<BootstrapMenuResponse>(bootstrapUrl.value)),
  {
    getCachedData(k, nuxtApp) {
      return nuxtApp.payload.data[k] as BootstrapMenuResponse | undefined
    },
  },
)

// A fetch failure leaves data.value undefined, same as a genuinely missing
// item — re-throw the real error first so outages aren't misreported as 404.
if (error.value) {
  throw error.value
}

const { config: siteConfig } = useBootstrap()

const item = computed<MenuItemType | null>(
  () => (data.value?.menu?.items as MenuItemType[] | undefined)?.find((i) => i.slug === route.params.slug) ?? null
)

// If no item matches after bootstrap resolves, throw a real 404
if (!item.value) {
  throw createError({ statusCode: 404, statusMessage: 'Menu item not found', fatal: true })
}
const category = computed(() => ({ name: item.value?.section }))
const currency = computed(() => siteConfig.value.default_currency || 'THB')

const formatPrice = (menuItem: MenuItemType | null) => {
  return formatMoneyAmount(menuItem?.price_amount, currency.value)
}

const formattedPrice = computed(() => formatPrice(item.value))
const isOnSale = computed(() => isSaleActive(item.value ?? {}))
const compareAtPrice = computed(() => formatMoneyAmount(item.value?.compare_at_price_amount, currency.value))

const isRobatayaki = computed(() =>
  category.value?.name?.toLowerCase().includes('robatayaki') ?? false
)

const mainMedia = computed(() => resolveMedia({
  public_url: item.value?.public_url,
  kind: item.value?.kind
}))
const visibleAllergens = computed(() =>
  item.value?.allergens?.filter(allergen => !allergen.includes('PLACEHOLDER')) ?? []
)

const visibleAllergensLabel = computed(() =>
  visibleAllergens.value.length > 0 ? visibleAllergens.value.join(', ') : 'Ask our team'
)

const detailSections = computed(() => {
  const sections = []
  if (item.value?.ingredients?.length) {
    sections.push({ name: 'Ingredients', items: item.value.ingredients })
  }
  if (item.value?.dietary_notes?.length) {
    sections.push({ name: 'Dietary notes', items: item.value.dietary_notes })
  }
  if (item.value?.serving_note) {
    sections.push({ name: 'Serving note', items: [item.value.serving_note] })
  }
  return sections
})


const relatedItems = ref<MenuItemType[]>([]) // To be implemented with a related items API if needed

const approvedReviews = ref<Review[]>([])
const reviewsLoading = ref(true)
const reviewSubmitting = ref(false)
const reviewMessage = ref('')
const reviewError = ref(false)

const reviewForm = reactive({
  author: '',
  rating: 5,
  title: '',
  content: ''
})

const reviews = computed(() => [
  ...(item.value?.reviews ?? []),
  ...approvedReviews.value
])

const reviewSummary = computed(() => {
  if (reviews.value.length === 0) return null
  const total = reviews.value.reduce((sum, review) => sum + Number(review.rating ?? 0), 0)
  return {
    count: reviews.value.length,
    average: (total / reviews.value.length).toFixed(1)
  }
})

const reviewDateTime = (review: Review) => review.datetime ?? review.createdAt ?? ''

const schemaImage = computed(() =>
  mainMedia.value.url ?? undefined
)
const currentPageUrl = useSeoUrl(() => item.value ? `/menu/${item.value.slug}` : '/menu')
const canonicalUrl = useSeoUrl(() => item.value?.canonical_url || (item.value ? `/menu/${item.value.slug}` : '/menu'))
const ogImage = useSharedOgImage(() => item.value?.og_image_public_url || mainMedia.value.thumb)

const loadReviews = async () => {
  if (!item.value?.slug) return
  reviewsLoading.value = true
  try {
    const response = await $fetch<ReviewsResponse>('/api/reviews', {
      query: { slug: item.value.slug }
    })
    approvedReviews.value = response.reviews ?? []
  } catch {
    approvedReviews.value = []
  } finally {
    reviewsLoading.value = false
  }
}

const scrollToReviewForm = () => {
  const el = document.getElementById('review-form-heading')
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

const resetReviewForm = () => {
  reviewForm.author = ''
  reviewForm.rating = 5
  reviewForm.title = ''
  reviewForm.content = ''

}

const submitReview = async () => {
  if (!item.value?.slug || reviewSubmitting.value) return

  reviewSubmitting.value = true
  reviewMessage.value = ''
  reviewError.value = false

  try {
    const response = await $fetch<SubmitReviewResponse>('/api/reviews', {
      method: 'POST',
      body: {
        menuItemSlug: item.value.slug,
        author: reviewForm.author,
        rating: reviewForm.rating,
        title: reviewForm.title,
        content: reviewForm.content
      }
    })

    reviewMessage.value = response.message ?? 'Thanks. Your review is pending moderation.'
    resetReviewForm()
  } catch (error) {
    reviewError.value = true
    reviewMessage.value = (error as ReviewSubmitError)?.data?.error ?? 'We could not submit your review. Please try again.'
  } finally {
    reviewSubmitting.value = false
  }
}



onMounted(async () => {
  await loadReviews()
})

watch(() => item.value?.slug, async () => {
  approvedReviews.value = []
  await loadReviews()
})

// SEO Meta
const seoTitle = () => item.value?.seo_title || (item.value ? `${item.value.name} | Menu | ${siteName.value}` : `Menu Item Not Found | ${siteName.value}`)
const seoDescription = () => truncateForSeo(item.value?.seo_description || (item.value ? item.value.description : 'The menu item you\'re looking for doesn\'t exist.'), 160)

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: () => siteName.value,
  ogImage,
  ogUrl: currentPageUrl,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  twitterImage: ogImage,
  robots: () => item.value?.robots || undefined,
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
})

const schemaGraph = computed(() => {
  if (!item.value) return []

  const additionalProperty = [
    item.value.preparation
      ? { '@type': 'PropertyValue', name: 'Preparation', value: item.value.preparation }
      : null,
    item.value.serving_note
      ? { '@type': 'PropertyValue', name: 'Serving note', value: item.value.serving_note }
      : null,
    visibleAllergens.value.length > 0
      ? { '@type': 'PropertyValue', name: 'Allergens', value: visibleAllergens.value.join(', ') }
      : null,
    item.value.ingredients?.length
      ? { '@type': 'PropertyValue', name: 'Ingredients', value: item.value.ingredients.join(', ') }
      : null,
    item.value.dietary_notes?.length
      ? { '@type': 'PropertyValue', name: 'Dietary notes', value: item.value.dietary_notes.join(', ') }
      : null
  ].filter((property): property is PropertyValue => property !== null)

  const menuItemSchema: MenuItemSchema = {
    '@type': 'MenuItem',
    name: item.value.name,
    description: item.value.description,
    image: schemaImage.value,
    suitableForDiet: []
  }

  if (item.value.price_amount !== null && item.value.price_amount !== undefined && item.value.price_amount !== '') {
    menuItemSchema.offers = {
      '@type': 'Offer',
      price: String(item.value.price_amount),
      priceCurrency: currency.value,
      availability: item.value.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
    }
  }

  if (additionalProperty.length > 0) {
    menuItemSchema.additionalProperty = additionalProperty
  }

  if (reviewSummary.value) {
    menuItemSchema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviewSummary.value.average,
      reviewCount: reviewSummary.value.count
    }
    menuItemSchema.review = reviews.value.map(review => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: review.author
      },
      datePublished: reviewDateTime(review),
      name: review.title,
      reviewBody: review.content,
      reviewRating: {
        '@type': 'Rating',
        ratingValue: String(review.rating),
        bestRating: '5'
      }
    }))
  }

  return [
    menuItemSchema,
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
        { '@type': 'ListItem', position: 2, name: 'Menu', item: '/menu' },
        ...(category.value?.name
          ? [{ '@type': 'ListItem', position: 3, name: category.value.name, item: '/menu' }]
          : []
        ),
        { '@type': 'ListItem', position: category.value?.name ? 4 : 3, name: item.value.name, item: `/menu/${item.value.slug}` }
      ]
    }
  ]
})

useHead(() => ({
  script: schemaGraph.value.length > 0
    ? [
        {
          key: 'menu-item-schema',
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': schemaGraph.value
          })
        }
      ]
    : []
}))
</script>
