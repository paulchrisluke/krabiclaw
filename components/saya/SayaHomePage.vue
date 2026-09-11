<template>
    <!-- Saya tenant homepage -->
    <div class="saya-restaurant-theme">

      <!-- ── Brand hero ─────────────────────────────────────── -->
      <SayaHomeHero
        :data="{
          hero: hero,
          eyebrow: getField('hero.eyebrow'),
          locations: pageLocations,
          businessTitle: businessTitle,
          businessSubtitle: businessSubtitle,
          hasOrderLinks: hasOrderLinks,
          ctaRoute: homePrimaryCtaRoute,
          reserveCta: homeCopy.reserveCta,
          orderNowCta: homeCopy.orderNowCta,
          viewMenuCta: homeCopy.viewMenuCta,
          viewMenuRoute: homeCopy.viewMenuRoute,
          brandColor: pageConfig.value?.brand_color,
          vertical: site?.vertical
        }"
      />

      <template v-if="pageData">
      <LazySayaFeaturedContent
        :data="{
          items: featuredProductCards,
          kicker: productPresentation?.locationCollectionSegment === 'menu'
            ? t('saya.footer.menu')
            : t('saya.footer.products'),
          heading: productPresentation?.locationCollectionSegment === 'menu'
            ? t('saya.footer.menu')
            : t('saya.products.collection_title', { site: brandName }),
          linkTarget: productPresentation ? productPresentation.collectionPath : null
        }"
      />

      <!-- ── Locations grid ─────────────────────────────────── -->
      <LazySayaLocationsGrid
        :data="{
          locations: locations,
          heading: homeCopy.locationGroupLine(locations.length),
          isAuthenticated: false,
          findUsKicker: homeCopy.findUsKicker,
          visitLocationCta: homeCopy.visitLocationCta,
          connectGoogleCta: homeCopy.connectGoogleCta
        }"
      />

      <!-- ── Posts / Lately ────────────────────────────────── -->
      <section v-if="recentPosts.length" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-16 max-w-2xl">
            <p class="saya-kicker mb-6">{{ homeCopy.latelyKicker }}</p>
            <h2 class="saya-display-md text-default">{{ homeCopy.highlightsSectionHeading }}</h2>
          </div>
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <template
              v-for="post in recentPosts"
              :key="post.id"
            >
              <!-- Navigate to the canonical post detail page. -->
              <NuxtLink
                :to="localePath(post.path)"
                class="group block overflow-hidden bg-default text-default no-underline transition hover:opacity-90"
                :class="post.wide ? 'sm:col-span-2' : ''"
              >
                <div
                  v-if="post.image"
                  class="overflow-hidden bg-muted"
                  :class="post.wide ? 'aspect-video' : 'aspect-square'"
                  :ref="post.imageKind === 'video' ? (el) => setPostVideoRef(el, post.id) : undefined"
                >
                  <video
                    v-if="post.imageKind === 'video' && visiblePostVideos.has(post.id)"
                    :src="post.image"
                    :poster="post.poster || undefined"
                    autoplay
                    muted
                    loop
                    playsinline
                    preload="none"
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <img
                    v-else-if="post.imageKind === 'video' && post.poster"
                    :src="post.poster"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <img
                    v-else-if="post.imageKind !== 'video'"
                    :src="post.image"
                    :alt="post.alt"
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  >
                </div>
                <div class="p-5 pt-4">
                  <p class="saya-eyebrow mb-2 text-muted">{{ homeCopy.postsEyebrow }}</p>
                  <p class="text-sm leading-relaxed text-default line-clamp-3">{{ post.text }}</p>
                  <p class="mt-3 saya-eyebrow text-muted opacity-60">{{ homeCopy.readMoreCta }}</p>
                </div>
              </NuxtLink>
            </template>
          </div>
        </div>
      </section>

      <!-- ── Brand story ─────────────────────────────────────── -->
      <LazySayaBrandStory
        v-if="getField('story.headline') || getField('story.body') || getField('story.image')"
        :data="{
          headline: getField('story.headline'),
          body: getField('story.body'),
          image: getField('story.image'),
          ourStoryKicker: homeCopy.ourStoryKicker,
          readMoreCta: homeCopy.readMoreCta
        }"
      />

      <!-- ── Aggregated reviews ──────────────────────────────── -->
      <section
        v-if="featuredReviews.length || (hasGoogleBusiness && googleReviewSummary && Number(googleReviewSummary.average) > 0)"
        class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8"
      >
        <div class="mb-12 max-w-2xl">
          <p class="saya-kicker mb-6">{{ homeCopy.reviewsKicker }}</p>
          <template v-if="hasGoogleBusiness && googleReviewSummary && Number(googleReviewSummary.average) > 0">
            <h2 class="saya-display-md flex flex-wrap items-center gap-4 text-default">
              <span class="flex text-primary" aria-hidden="true">
                <SayaIcon
                  v-for="i in 5"
                  :key="i"
                  name="star"
                  :solid="i <= Math.round(Number(googleReviewSummary.average))"
                  class="size-8"
                />
              </span>
              <span v-if="googleReviewSummary.count" class="text-muted">{{ t('saya.reviews.rating_summary', { average: googleReviewSummary.average, count: googleReviewSummary.count.toLocaleString() }) }}</span>
              <span v-else>{{ googleReviewSummary.average }}</span>
            </h2>
            <p class="mt-6 text-sm text-muted">{{ homeCopy.guestReviewsLabel }}</p>
          </template>
          <template v-else>
            <h2 class="saya-display-md text-default">{{ homeCopy.whatGuestsSayLabel }}</h2>
          </template>
        </div>

        <!-- Location filter chips (multi-location only) -->
        <div v-if="locations.length > 1 && featuredReviews.length" class="mb-8 flex flex-wrap gap-2">
          <button
            :class="[
              'rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-widest transition',
              reviewFilter === 'all'
                ? 'border-inverted bg-inverted text-inverted'
                : 'border-default bg-default text-muted hover:border-muted hover:text-default'
            ]"
            @click="reviewFilter = 'all'"
          >
            {{ homeCopy.allLocationsFilter }}
          </button>
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="localePath(`/locations/${loc.slug}/reviews`)"
            class="rounded-full border border-default bg-default px-4 py-2 text-xs font-medium uppercase tracking-widest text-muted no-underline transition hover:border-muted hover:text-default"
          >
            {{ loc.title }}
          </NuxtLink>
        </div>

        <!-- Real reviews -->
        <div v-if="featuredReviews.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <SayaReviewCard
            v-for="review in featuredReviews"
            :key="review.id"
            :review="review"
            variant="compact"
          />
        </div>
      </section>

      <!-- ── Blog highlights ──────────────────────────────────── -->
      <AppSection v-if="recentBlogPosts.length" bg="black" padding="xl">
        <div class="mb-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl">
            <p class="saya-kicker mb-6 text-inverted/60">{{ t('saya.footer.blog') }}</p>
            <h2 class="saya-display-md text-inverted">{{ t('saya.posts.title') }}</h2>
          </div>
          <NuxtLink :to="localePath('/blog')" class="inline-flex text-sm font-medium text-inverted no-underline hover:underline">
            {{ t('saya.footer.visit_page') }}
          </NuxtLink>
        </div>

        <div class="grid gap-6 lg:grid-cols-3">
          <NuxtLink
            v-for="post in recentBlogPosts"
            :key="post.slug"
            :to="localePath(`/blog/${post.slug}`)"
            class="group block overflow-hidden rounded-xl border border-inverted/10 bg-inverted/5 no-underline transition hover:-translate-y-0.5 hover:border-inverted/20"
          >
            <div v-if="post.image" class="aspect-4/3 overflow-hidden bg-inverted/10">
              <img
                :src="post.image"
                :alt="post.title"
                loading="lazy"
                decoding="async"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              >
            </div>
            <div class="p-6">
              <div class="mb-3 flex flex-wrap items-center gap-3">
                <span v-if="post.category" class="rounded bg-inverted/10 px-2 py-1 text-xs font-medium text-inverted/70">
                  {{ post.category }}
                </span>
                <span v-if="post.publishedAt" class="text-sm text-inverted/40">
                  <NuxtTime :datetime="post.publishedAt" :locale="locale" year="numeric" month="long" day="numeric" time-zone="UTC" />
                </span>
              </div>
              <h3 class="text-2xl font-semibold leading-tight text-inverted">{{ post.title }}</h3>
              <p v-if="post.excerpt" class="mt-3 text-sm leading-relaxed text-inverted/60">{{ post.excerpt }}</p>
              <p class="mt-4 text-sm font-medium text-inverted">{{ t('saya.posts.read_full_story') }}</p>
            </div>
          </NuxtLink>
        </div>
      </AppSection>

      <!-- ── CTA strip (strict component) ───────────────────── -->
      <LazySayaCTA
        :title="getField('cta.title')"
        :description="getField('cta.description')"
        :cta-route="homePrimaryCtaRoute"
        :reserve-cta="homeCopy.reserveCta"
        :has-order-links="hasOrderLinks"
        :bg="'default'"
        :padding="'lg'"
      />

      <section
        v-if="supplementalPending || supplementalError"
        class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
        data-testid="saya-home-supplemental-status"
      >
        <p v-if="supplementalPending" class="text-sm text-muted">{{ t('saya.search.searching', { surface: t('saya.posts.title') }) }}</p>
        <div v-else role="alert" class="border border-default bg-elevated p-5 text-sm text-default">
          <p>{{ supplementalErrorMessage }}</p>
        </div>
      </section>

      </template>
      <section v-else-if="pageError" class="mx-auto max-w-xl px-4 py-16 text-center sm:px-6" data-testid="saya-home-content-error">
        <p role="alert" class="text-sm text-muted">{{ t('saya.common.temporarily_unavailable') }}</p>
      </section>
    </div>

</template>

<script setup>
import { formatProductMoney } from '~/utils/product-money'
import { groupProductsByCollection, resolveProductPresentation } from '~/utils/product-presentation'
import { getActiveSpecialClosure } from '~/utils/formatters'
import { selectPrice } from '~/shared/prices'
import { normalizeRobotsIntent } from '~/shared/robots-directive'

const { siteId, draftId, site } = useTenantSite()
const { locale, localePath, t } = useI18n()

const homeCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const { resolveMedia } = useMedia()


// Validate tenant context ONLY for tenant sites
if (!siteId && !draftId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}

// Route-owned page data and persistent chrome are served by the same canonical
// page resource. The layout and this component share its keyed async-data state.
const {
  data: pageData,
  error: pageError,
  locations: pageLocations,
  googleBusiness: pageGoogleBusiness,
  getField,
  getHero,
  config: pageConfig,
  site: publicSite,
  products,
  collections,
} = await usePublicPageData({ server: true, lazy: false })

const {
  data: supplementalData,
  googleBusiness: supplementalGoogleBusiness,
  blogList,
  error: supplementalError,
  pending: supplementalPending,
} = await usePublicPageData({
  datasets: ['reviews', 'posts', 'blog'],
  server: false,
  lazy: true,
  routeOwned: false,
})

const locations = computed(() => pageLocations.value)
const hasOrderLinks = computed(() =>
  locations.value.some(loc => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

// Location ids currently under an active special_hours closure (e.g. "closed
// for renovations") — used to mark the products offered there unavailable
// without touching the product's own state.
const closedLocationIds = computed(() => new Set(
  locations.value
    .filter(loc => getActiveSpecialClosure(loc.special_hours, loc.timezone))
    .map(loc => loc.id)
))

const brandName = computed(() => String(publicSite.value?.brand_name ?? '').trim())
const productPresentation = computed(() => resolveProductPresentation(publicSite.value?.vertical))

const googleBusiness = computed(() => {
  const gb = pageGoogleBusiness.value
  if (!gb) return null
  const supplemental = supplementalData.value !== undefined && !supplementalError.value
    ? supplementalGoogleBusiness.value
    : null
  return {
    ...gb,
    reviews: ((supplemental?.reviews ?? gb.reviews) || []).map((r) => ({
      ...r,
      author_name: r.author_name ?? '',
      date: r.date || r.createTime || r.updateTime
    })),
    posts: supplemental?.posts ?? gb.posts ?? [],
  }
})

const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const businessTitle = computed(() => googleBusiness.value?.business?.title ?? null)
const businessSubtitle = computed(() => googleBusiness.value?.business?.profile?.description ?? null)
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? review.rating ?? 0)
const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
    if (ratings.length === 0) return null
    return { average: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length }
  }
  const average = Number(summary.averageRating)
  if (!Number.isFinite(average) || average <= 0) return null
  return { average: average.toFixed(1), count: summary.totalReviewCount }
})

const restaurantName = computed(() => site?.brand_name?.trim() || businessTitle.value?.trim() || '')

// Hero metadata from CMS and imported location data — used for OG image metadata below,
// SayaHomeHero.vue resolves its own copy via getHero() from its :data prop.
const hero = computed(() => getHero({
  title: businessTitle.value || '',
  subtitle: businessSubtitle.value || '',
  image: '',
  video: ''
}))

// SEO for tenant sites: set ogUrl to the actual request URL so custom domains share correctly.
if (siteId) {
  const seoTitle = computed(() => {
    if (pageConfig.value?.seo_title) return pageConfig.value.seo_title
    const primary = (restaurantName.value || '').trim()
    const secondary = businessTitle.value?.trim() || ''
    if (!primary || primary.toLowerCase() === secondary.toLowerCase()) {
      return secondary
    }
    return `${primary} | ${secondary}`
  })

  // composeSocialMetadata (the shared composer) does its own platform-appropriate
  // truncation, so
  // this page shouldn't pre-truncate and risk drifting from that length.
  const seoDescription = computed(() =>
    pageConfig.value?.seo_description || businessSubtitle.value || ''
  )

  useSocialMetadata(() => ({
    path: pageConfig.value?.canonical_url || '/',
    title: seoTitle.value,
    description: seoDescription.value,
    brand: {
      siteName: site?.brand_name || restaurantName.value,
    },
    robots: normalizeRobotsIntent(pageConfig.value?.robots),
  }))
}

/**
 * The preview this page shows of the catalogue.
 *
 * There is no "featured" flag to read: the merchant's curation is the order of
 * their collections and the order of products inside them, so this shows the
 * front of that arrangement and links to the whole thing. A site with no
 * collections shows no preview here rather than an arbitrary handful.
 */
const previewProducts = computed(() => groupProductsByCollection(products.value, collections.value)
  .flatMap(group => group.products.map(product => ({ product, collectionName: group.name })))
  .slice(0, 4))
const isExperienceTenant = computed(() => site?.vertical === 'experience')
const homePrimaryCtaRoute = computed(() => {
  // An experience tenant's primary action is to browse what is on offer; the
  // collection route is the one place that lists it.
  if (isExperienceTenant.value) return productPresentation.value?.collectionPath ?? null
  return homeCopy.value.ctaRoute
})

// Review location filter
const reviewFilter = ref('all')

const visiblePostVideos = ref(new Set())
const postVideoRefs = {}
let postVideoObserver = null

function setPostVideoRef(el, postId) {
  const node = el?.$el || el
  if (!(node instanceof HTMLElement)) return
  postVideoRefs[postId] = node
  postVideoObserver?.observe(node)
}

onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  postVideoObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const postId = Object.entries(postVideoRefs).find(([, node]) => node === entry.target)?.[0]
      if (!postId) continue
      visiblePostVideos.value = new Set([...visiblePostVideos.value, postId])
      postVideoObserver?.unobserve(entry.target)
    }
  }, { rootMargin: '200px' })
  Object.values(postVideoRefs).forEach(node => postVideoObserver?.observe(node))
})

onBeforeUnmount(() => postVideoObserver?.disconnect())

const hasGoogleBusiness = computed(() => !!googleBusiness.value?.business)
const featuredReviews = computed(() =>
  googleReviews.value.slice(0, 3).map((review, i) => ({
    id: review.id ?? review.name ?? i,
    author: review.author_name ?? '',
    source: review.source,
    original_reference: review.original_reference,
    google_review_metadata: review.google_review_metadata,
    content: review.comment?.text || review.content || '',
    rating: googleReviewRating(review),
    locationTitle: locations.value.length > 1 ? review.location_title || null : null,
  })).filter(review => review.author && review.content)
)

// Recent posts — shown in the "Lately" section, each tile links to the real
// post page (pages/posts/[slug].vue, rendered by SayaPostDetail.vue). A post
// with no resolvable path can't link anywhere meaningful, so it's excluded
// rather than falling back to the generic /posts index.
const recentPosts = computed(() => {
  const posts = (googlePosts.value || [])
    .filter(p => p.public_path)
  return posts.slice(0, 4).map((post, i) => ({
    id: post.slug || String(i),
    path: post.public_path,
    image: post.media?.[0]?.public_url || null,
    imageKind: post.media?.[0]?.kind || 'image',
    poster: post.media?.[0]?.thumbnail_url || null,
    text: post.summary || '',
    alt: post.summary || 'Post image',
    wide: i === 0,
  }))
})

const recentBlogPosts = computed(() =>
  (blogList.value || [])
    .filter(post => post.slug && typeof post.title === 'string' && post.title.trim())
    .slice(0, 3)
    .map((post) => ({
      slug: String(post.slug || ''),
      title: post.title.trim(),
      excerpt: typeof post.excerpt === 'string' ? post.excerpt : '',
      category: typeof post.category === 'string' ? post.category : '',
      publishedAt: typeof post.published_at === 'string' ? post.published_at : null,
      image: resolveMedia(post.cover).thumb,
    }))
)

const supplementalErrorMessage = computed(() => {
  const details = supplementalError.value && typeof supplementalError.value === 'object' && 'requestId' in supplementalError.value
    && typeof supplementalError.value.requestId === 'string'
    ? supplementalError.value.requestId
    : ''
  return details
    ? `${t('saya.common.temporarily_unavailable')} (${details})`
    : t('saya.common.temporarily_unavailable')
})

const locationSlugById = computed(() => new Map(locations.value.map(location => [location.id, location.slug])))
const currency = computed(() => {
  const code = pageConfig.value?.default_currency
  if (!code) throw new Error('The site currency is unavailable')
  return code
})
const featuredProductCards = computed(() => {
  const presentation = productPresentation.value
  if (!presentation) return []
  return previewProducts.value.map(({ product, collectionName }) => {
    // A product offered at several of this site's locations has no single
    // route, so it is previewed without a link rather than linked to a
    // location the merchant did not name.
    const published = product.locations.filter(entry => entry.published && locationSlugById.value.has(entry.location_id))
    const locationId = published.length === 1 ? published[0].location_id : null
    // Each variant resolves its own offer through the one selection contract;
    // the card shows the lowest of them, the same "from" price the collection
    // page shows.
    const selection = { currency: currency.value, location_id: locationId, at: new Date().toISOString() }
    const price = product.variants
      .flatMap(variant => selectPrice(variant.prices, selection) ?? [])
      .reduce((lowest, offer) => (!lowest || offer.unit_amount < lowest.unit_amount ? offer : lowest), null)
    return {
      name: product.name,
      category: collectionName,
      description: product.description,
      price: formatProductMoney(price),
      compareAtPrice: price && price.compare_at_unit_amount !== null
        ? formatProductMoney({ ...price, unit_amount: price.compare_at_unit_amount, compare_at_unit_amount: null })
        : null,
      image: product.image?.public_url || null,
      alt: product.image?.alt_text || product.name,
      href: locationId ? presentation.productPath(locationSlugById.value.get(locationId), product.slug) : null,
      unavailable: !product.active
        || (locationId !== null && closedLocationIds.value.has(locationId))
        || price === null,
    }
  })
})

</script>
