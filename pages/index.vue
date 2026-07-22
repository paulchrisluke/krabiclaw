<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawbyPage ? 'blawby' : 'saya'">
    <!-- KrabiClaw Platform Homepage -->
    <div v-if="isPlatform" class="bg-default">

      <!-- Hero -->
      <section class="relative overflow-hidden">
        <!-- Ambient gradient orbs -->
        <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div class="absolute -top-40 -right-32 w-[700px] h-[700px] rounded-full opacity-25 blur-3xl" style="background: radial-gradient(circle, var(--kc-coral-200) 0%, transparent 70%)"></div>
          <div class="absolute -bottom-20 -left-32 w-[600px] h-[600px] rounded-full opacity-20 blur-3xl" style="background: radial-gradient(circle, var(--kc-teal-100) 0%, transparent 70%)"></div>
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full opacity-10 blur-3xl" style="background: radial-gradient(ellipse, var(--kc-navy-300) 0%, transparent 70%)"></div>
        </div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 grid lg:grid-cols-2 gap-12 items-center">
          <div class="flex flex-col gap-6">
            <!-- Eyebrow -->
            <span class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/20">
              <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0 animate-pulse" />
              Now on ChatGPT
            </span>

            <!-- Headline -->
            <h1 class="text-[clamp(40px,5vw,66px)] font-extrabold leading-[1.02] tracking-tight text-balance m-0">
              <span class="text-default">Your local business,</span><br>
              <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 40%, var(--kc-coral-400) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">managed through</span><br>
              <span class="text-default">ChatGPT.</span>
            </h1>

            <p class="text-lg leading-relaxed text-muted m-0 max-w-lg">
              Sign up, add the KrabiClaw app in ChatGPT, and start editing your menus, content, and photos through conversation.
            </p>

            <!-- CTAs -->
            <div class="flex flex-wrap gap-3">
              <NuxtLink
                to="/signup"
                class="inline-flex items-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-[10px] hover:opacity-90 transition-all no-underline text-white shadow-lg"
                style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 100%); box-shadow: 0 4px 20px rgba(251,116,97,0.35);"
              >
                Start free
                <PlatformIcon name="arrow-right" class="size-4" />
              </NuxtLink>
              <NuxtLink
                to="/plugin"
                class="inline-flex items-center gap-2 bg-transparent text-(--kc-teal-600) border border-(--kc-teal)/50 font-semibold text-[15px] px-6 py-3.5 rounded-full hover:bg-(--kc-teal-100) transition-colors no-underline"
              >
                <PlatformIcon name="puzzle" class="size-4" />
                Get the ChatGPT app
              </NuxtLink>
            </div>

            <!-- Social proof -->
            <div class="flex items-center gap-3 mt-2">
              <div class="flex">
                <div
                  v-for="(av, i) in avatars"
                  :key="i"
                  class="w-8 h-8 rounded-full border-2 border-default flex items-center justify-center text-white text-xs font-bold -ml-2 first:ml-0"
                  :style="{ background: av.color }"
                >{{ av.letter }}</div>
              </div>
              <p class="text-[13px] text-muted m-0">
                Trusted by <strong class="text-default">1,200+ businesses</strong> across SE Asia
              </p>
            </div>
          </div>

          <!-- Mascot / hero visual -->
          <div class="hidden lg:flex justify-center">
            <div class="relative max-w-lg w-full">
              <!-- Glow ring behind the card -->
              <div class="absolute inset-0 rounded-3xl blur-2xl opacity-30" style="background: linear-gradient(135deg, var(--kc-coral-200), var(--kc-teal-100));"></div>
              <div class="relative rounded-3xl p-7 shadow-2xl border border-default/50" style="background: linear-gradient(145deg, var(--kc-coral-50) 0%, #fff8f6 100%);">
                <img
                  src="/krabiclaw-login-mascot.png"
                  alt="KrabiClaw mascot"
                  class="w-full block rounded-[20px] shadow-lg"
                >
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="relative py-24 overflow-hidden">
        <!-- Subtle gradient background -->
        <div class="absolute inset-0 -z-10" style="background: linear-gradient(180deg, var(--ui-bg-elevated) 0%, var(--ui-bg) 100%);"></div>
        <div class="absolute top-0 inset-x-0 h-px" style="background: linear-gradient(90deg, transparent 0%, var(--kc-border) 50%, transparent 100%);"></div>
        <div class="absolute bottom-0 inset-x-0 h-px" style="background: linear-gradient(90deg, transparent 0%, var(--kc-border) 50%, transparent 100%);"></div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-muted">Everything your business needs</span>
            <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0">
              <span class="text-default">Everything your site needs.</span><br>
              <span class="text-muted font-bold">Nothing you don't.</span>
            </h2>
          </div>
          <div class="grid md:grid-cols-3 gap-5">
            <div
              v-for="feat in features"
              :key="feat.title"
              class="group relative rounded-[18px] p-7 border border-default transition-all duration-300 hover:-translate-y-0.5 hover:border-(--kc-coral)/30 hover:shadow-lg bg-white dark:bg-(--ui-bg-elevated)"
            >
              <!-- Subtle gradient top highlight on hover -->
              <div
                class="absolute inset-x-0 top-0 h-px rounded-t-[18px] opacity-0 group-hover:opacity-100 transition-opacity"
                style="background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--kc-coral) 40%, transparent), transparent);"
              ></div>

              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center mb-5 shadow-sm"
                style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%); box-shadow: 0 4px 12px rgba(31,37,71,0.15);"
              >
                <PlatformIcon :name="feat.icon" class="size-5 text-white" />
              </div>
              <h3
                class="text-lg font-bold mb-2 m-0 text-default"
              >{{ feat.title }}</h3>
              <p
                class="text-[14px] leading-relaxed m-0 text-muted"
              >{{ feat.body }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Pricing -->
      <section class="relative py-24 overflow-hidden">
        <!-- Ambient gradient -->
        <div class="pointer-events-none absolute inset-0 -z-10">
          <div class="absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-30" style="background: radial-gradient(circle, var(--kc-coral-200) 0%, transparent 70%);"></div>
          <div class="absolute bottom-0 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-20" style="background: radial-gradient(circle, var(--kc-teal-100) 0%, transparent 70%);"></div>
        </div>

        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-12 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-dimmed">Simple pricing</span>
            <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0">
              <span class="text-default">Start free.</span>
              <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, var(--kc-teal) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;"> Grow when you're ready.</span>
            </h2>
          </div>
          <div class="relative rounded-[28px] border border-default/60 p-6 sm:p-10 shadow-2xl backdrop-blur-sm" style="background: color-mix(in srgb, var(--ui-bg-elevated) 80%, transparent);">
            <BillingPricingTable :plans="plans" />
          </div>
        </div>
      </section>
    </div>

    <!-- Blawby tenant homepage -->
    <BlawbyHome v-else-if="isBlawbyPage" />

    <!-- Saya tenant homepage -->
    <div v-else class="saya-restaurant-theme">

      <!-- ── Brand hero ─────────────────────────────────────── -->
      <SayaHomeHero
        :data="{
          hero: hero,
          eyebrow: getField('hero.eyebrow', businessCity),
          locations: bootstrapLocations,
          businessTitle: businessTitle,
          businessSubtitle: businessSubtitle,
          businessCity: businessCity,
          businessPrimaryPhoto: businessPrimaryPhoto,
          hasOrderLinks: hasOrderLinks,
          ctaRoute: homeCopy.ctaRoute,
          reserveCta: homeCopy.reserveCta,
          orderNowCta: homeCopy.orderNowCta,
          viewMenuCta: homeCopy.viewMenuCta,
          viewMenuRoute: homeCopy.viewMenuRoute,
          brandColor: bootstrapConfig.value?.brand_color,
          vertical: site?.vertical
        }"
      />

      <!-- ── Featured content (dishes / experiences) ─────────── -->
      <LazySayaFeaturedContent
        :data="{
          items: featuredContent,
          hasMenu: hasMenu,
          vertical: site?.vertical
        }"
      />

      <!-- ── Locations grid ─────────────────────────────────── -->
      <LazySayaLocationsGrid
        :data="{
          locations: locations,
          heading: homeCopy.locationGroupLine(locations.length),
          isAuthenticated: isAuthenticated,
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
              <!-- Trigger tile — navigates to the real post page (SayaPostDetail.vue is
                   the single source of truth for post detail UI; this used to open a
                   separate, hand-rolled modal here that duplicated and diverged from it). -->
              <NuxtLink
                :to="post.path"
                class="group block overflow-hidden bg-default text-default no-underline transition hover:opacity-90"
                :class="post.wide ? 'sm:col-span-2' : ''"
              >
                <div v-if="post.image" class="overflow-hidden bg-muted" :class="post.wide ? 'aspect-video' : 'aspect-square'">
                  <video
                    v-if="post.imageKind === 'video'"
                    :src="post.image"
                    autoplay
                    muted
                    loop
                    playsinline
                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <img
                    v-else
                    :src="post.image"
                    :alt="post.alt"
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
        :data="{
          headline: getField('story.headline', businessTitle),
          body: getField('story.body', businessSubtitle),
          image: getField('story.image'),
          isAuthenticated: isAuthenticated,
          ourStoryKicker: homeCopy.ourStoryKicker,
          readMoreCta: homeCopy.readMoreCta,
          brandStoryPlaceholder: homeCopy.brandStoryPlaceholder,
          brandStoryDescription: homeCopy.brandStoryDescription,
          addStoryCta: homeCopy.addStoryCta
        }"
      />

      <!-- ── Aggregated reviews ──────────────────────────────── -->
      <section
        v-if="featuredReviews.length || (hasGoogleBusiness && googleReviewSummary && Number(googleReviewSummary.average) > 0) || isAuthenticated"
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
              {{ googleReviewSummary.average }}
              <span v-if="googleReviewSummary.count" class="text-muted">· {{ googleReviewSummary.count?.toLocaleString() }} reviews</span>
            </h2>
            <p class="mt-6 text-sm text-muted">{{ homeCopy.guestReviewsLabel }}</p>
          </template>
          <template v-else-if="isAuthenticated">
            <h2 class="saya-display-md text-default opacity-30">{{ homeCopy.whatGuestsSayLabel }}</h2>
            <p class="mt-6 text-sm text-muted opacity-50">{{ homeCopy.noReviewsLabel }}</p>
            <NuxtLink
              to="/dashboard"
              class="mt-4 inline-block text-xs uppercase tracking-widest text-default opacity-50 no-underline underline-offset-4 hover:underline hover:opacity-80"
            >
              {{ homeCopy.connectGoogleReviewsCta }}
            </NuxtLink>
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
            :to="`/locations/${loc.slug}/reviews`"
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
            <p class="saya-kicker mb-6 text-inverted/60">From the blog</p>
            <h2 class="saya-display-md text-inverted">Planning ideas, updates, and stories from the studio.</h2>
          </div>
          <NuxtLink to="/blog" class="inline-flex text-sm font-medium text-inverted no-underline hover:underline">
            Visit the blog
          </NuxtLink>
        </div>

        <div class="grid gap-6 lg:grid-cols-3">
          <NuxtLink
            v-for="post in recentBlogPosts"
            :key="post.slug"
            :to="`/blog/${post.slug}`"
            class="group block overflow-hidden rounded-xl border border-inverted/10 bg-inverted/5 no-underline transition hover:-translate-y-0.5 hover:border-inverted/20"
          >
            <div v-if="post.image" class="aspect-4/3 overflow-hidden bg-inverted/10">
              <img
                :src="post.image"
                :alt="post.title"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              >
            </div>
            <div class="p-6">
              <div class="mb-3 flex flex-wrap items-center gap-3">
                <span v-if="post.category" class="rounded bg-inverted/10 px-2 py-1 text-xs font-medium text-inverted/70">
                  {{ post.category }}
                </span>
                <span v-if="post.publishedAt" class="text-sm text-inverted/40">
                  <NuxtTime :datetime="post.publishedAt" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
                </span>
              </div>
              <h3 class="text-2xl font-semibold leading-tight text-inverted">{{ post.title }}</h3>
              <p v-if="post.excerpt" class="mt-3 text-sm leading-relaxed text-inverted/60">{{ post.excerpt }}</p>
              <p class="mt-4 text-sm font-medium text-inverted">Read article</p>
            </div>
          </NuxtLink>
        </div>
      </AppSection>

      <!-- ── CTA strip (strict component) ───────────────────── -->
      <LazySayaCTA
        :title="getField('cta.title')"
        :description="getField('cta.description')"
        :cta-route="homeCopy.ctaRoute"
        :reserve-cta="homeCopy.reserveCta"
        :bg="'default'"
        :padding="'lg'"
      />

      <!-- ── Dynamic content blocks ───────────────────────────── -->
      <template v-if="contentBlocks.length > 0">
        <component
          v-for="block in contentBlocks.filter(b => b.component)"
          :key="block._uid || block.field"
          :is="resolveComponent(block.component)"
          :data="block"
          class="content-block"
        />
      </template>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'
import { formatMoneyAmount, isSaleActive, resolveOverridePriceDisplay } from '~/shared/money'
import { useDynamicComponent } from '~/composables/useDynamicComponent'
import { getActiveSpecialClosure } from '~/utils/formatters'

definePageMeta({ layout: false })

const { isPlatform, siteId, site } = useTenantSite()
const { isBlawby } = usePublicTemplate()
const { locale } = useI18n()
const isBlawbyPage = computed(() => isBlawby.value)
const shouldUseSayaBootstrap = computed(() => !isBlawbyPage.value)

const platformPlans = isPlatform ? usePlans().plans : ref(null)
const plans = computed(() => isPlatform ? platformPlans.value : null)

const { isAuthenticated } = useAuth()
const homeCopy = computed(() => getVerticalCopy(site?.vertical, locale.value))
const { resolveMedia } = useMedia()

const { resolveComponent } = useDynamicComponent()

// Platform homepage data
const avatars = [
  { color: '#FB7461', letter: 'S' },
  { color: '#2BB5B5', letter: 'K' },
  { color: '#F8C546', letter: 'M' },
  { color: '#1F2547', letter: 'A' },
]
const features = [
  { icon: 'message-circle', title: 'Edit through ChatGPT', body: 'Update menus, content, and photos by talking to ChatGPT. No CMS to learn.' },
  { icon: 'sparkles', title: 'Beautiful themes', body: 'Conversion-optimized themes for local businesses. Pick one, swap a color, you\'re live.' },
  { icon: 'globe', title: 'Google Business sync', body: 'Hours, photos, offerings — pushed to Google so guests find the right info every time.' },
  { icon: 'calendar', title: 'Bookings + waitlist', body: 'Take bookings 24/7 with WhatsApp confirmations. Walk-ins go on the waitlist automatically.' },
  { icon: 'inbox', title: 'Full Inbox', body: 'Manage all your reservations, bookings, and contact inquiries from a single, unified inbox.' },
  { icon: 'bar-chart', title: 'Real-time insights', body: 'See visits, top pages, and busy hours — ask ChatGPT or check the analytics tab.' },
]
// Validate tenant context ONLY for tenant sites
if (!isPlatform && !siteId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}

// ── Single SSR call ───────────────────────────────────────────────────────
// Replaces: /locations + /google-business + /config + /content/home + /menus
// SayaHeader + SayaFooter share the same bootstrap key — zero duplicate calls.
const {
  locations: bootstrapLocations,
  googleBusiness: bootstrapGB,
  getField,
  getHero,
  config: bootstrapConfig,
  menuItemsBySection,
  experiencesList,
  contentBlocks,
  blogList,
} = useBootstrap({ enabled: shouldUseSayaBootstrap })

const locations = computed(() => bootstrapLocations.value)
const hasOrderLinks = computed(() =>
  locations.value.some(loc => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

// Location ids currently under an active special_hours closure (e.g. "closed
// for renovations") — used to mark their experiences unavailable without
// touching the experience's own status.
const closedLocationIds = computed(() => new Set(
  locations.value
    .filter(loc => getActiveSpecialClosure(loc.special_hours, loc.timezone))
    .map(loc => loc.id)
))

// Check if there's a menu
const hasMenu = computed(() => {
  const allItems = Object.values(menuItemsBySection.value).flat()
  return allItems.length > 0
})

const googleBusiness = computed(() => {
  const gb = bootstrapGB.value
  if (!gb) return null
  return {
    ...gb,
    media: gb.media && gb.media.length ? gb.media : [{ google_url: gb.business?.profile?.photoUrl || '' }],
    reviews: (gb.reviews || []).map((r) => ({
      ...r,
      author_name: r.author || r.reviewer?.displayName || r.author_name || 'Anonymous',
      date: r.date || r.createTime || r.updateTime
    }))
  }
})

const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const businessTitle = computed(() => googleBusiness.value?.business?.title ?? null)
const businessSubtitle = computed(() => googleBusiness.value?.business?.profile?.description ?? null)
const businessPrimaryPhoto = computed(() => googleBusiness.value?.media?.[0])
const businessCity = computed(() => googleBusiness.value?.business?.city ?? null)
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

const restaurantName = computed(() => site?.brand_name || businessTitle.value || 'Business')

// Hero from CMS with Google Business fallbacks — used for OG image metadata below,
// SayaHomeHero.vue resolves its own copy via getHero() from its :data prop.
const hero = computed(() => getHero({
  title: businessTitle.value || '',
  subtitle: businessSubtitle.value || '',
  image: '',
  video: ''
}))

// SEO for KrabiClaw Platform
if (isPlatform) {
  const platformOgDescription = 'Beautiful local business websites edited through ChatGPT. Google Business sync, bookings, and real-time analytics included.'

  usePlatformPageSeo({
    path: '/',
    title: 'Local SEO Websites Managed Through ChatGPT',
    description: platformOgDescription,
    isHomepage: true,
    breadcrumbs: [
      { name: 'Home', url: '/' },
    ],
  })
}

// SEO for tenant sites: set ogUrl to the actual request URL so custom domains share correctly.
if (!isPlatform && siteId && !isBlawbyPage.value) {
  const seoTitle = computed(() => {
    if (bootstrapConfig.value?.seo_title) return bootstrapConfig.value.seo_title
    const primary = (restaurantName.value || '').trim()
    const secondary = (businessTitle.value || 'Business').trim() || 'Business'
    if (!primary || primary.toLowerCase() === secondary.toLowerCase()) {
      return secondary
    }
    return `${primary} | ${secondary}`
  })

  // Full-length fallback-resolved description — composeSocialMetadata (the
  // shared #259 composer) does its own platform-appropriate truncation, so
  // this page shouldn't pre-truncate and risk drifting from that length.
  const seoDescription = computed(() =>
    bootstrapConfig.value?.seo_description || businessSubtitle.value || 'Professional business website with photos, updates and reviews.'
  )

  useTenantSocialMetadata(() => ({
    path: bootstrapConfig.value?.canonical_url || '/',
    title: seoTitle.value,
    description: seoDescription.value,
    brand: {
      siteName: site?.brand_name || restaurantName.value,
      logoUrl: bootstrapConfig.value?.logo_url || null,
      faviconUrl: bootstrapConfig.value?.favicon_url || null,
      primaryColor: bootstrapConfig.value?.brand_color || null,
    },
    heroImage: hero.value.image ? { url: hero.value.image } : null,
    ogImageOverride: bootstrapConfig.value?.og_image_url ? { url: bootstrapConfig.value.og_image_url } : null,
    robots: bootstrapConfig.value?.robots || null,
  }))
}

// Featured menu items from bootstrap menu
const featuredMenuItems = computed(() => {
  const allItems = Object.values(menuItemsBySection.value).flat()
  const featured = allItems
    .filter(item => item.available !== false && item.featured)
    .sort((a, b) => {
      if ((a.featured_sort_order ?? 0) !== (b.featured_sort_order ?? 0)) {
        return (a.featured_sort_order ?? 0) - (b.featured_sort_order ?? 0)
      }
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      return String(a.name ?? '').localeCompare(String(b.name ?? ''))
    })
  return (featured.length > 0 ? featured : allItems.filter(item => item.available !== false)).slice(0, 6)
})

// Featured experiences (used when no menu exists)
const featuredExperiences = computed(() => {
  const allExperiences = experiencesList.value || []
  const featured = allExperiences
    .filter(exp => exp.status === 'active' && exp.featured)
    .sort((a, b) => {
      const fa = Number(a.featured_sort_order ?? Infinity)
      const fb = Number(b.featured_sort_order ?? Infinity)
      if (fa !== fb) return fa - fb
      const sa = Number(a.sort_order ?? Infinity)
      const sb = Number(b.sort_order ?? Infinity)
      if (sa !== sb) return sa - sb
      return String(a.title ?? '').localeCompare(String(b.title ?? ''))
    })
  return (featured.length > 0 ? featured : allExperiences.filter(exp => exp.status === 'active')).slice(0, 6)
})
const defaultCurrency = computed(() => bootstrapConfig.value.default_currency || 'THB')

// Review location filter
const reviewFilter = ref('all')

const hasGoogleBusiness = computed(() => !!googleBusiness.value?.business)
const featuredReviews = computed(() =>
  googleReviews.value.slice(0, 3).map((review, i) => ({
    id: review.id ?? review.name ?? i,
    author: review.reviewer?.displayName || review.author_name || 'Anonymous',
    content: review.comment?.text || review.content || '',
    rating: googleReviewRating(review),
    locationTitle: locations.value.length > 1 ? review.location_title || null : null,
  }))
)

// Recent posts — shown in the "Lately" section, each tile links to the real
// post page (pages/posts/[slug].vue, rendered by SayaPostDetail.vue). A post
// with no resolvable path can't link anywhere meaningful, so it's excluded
// rather than falling back to the generic /posts index.
const recentPosts = computed(() => {
  const posts = (googlePosts.value || [])
    .filter(p => p.media?.[0]?.url && (p.publicPath || p.public_path || p.slug))
  return posts.slice(0, 4).map((post, i) => ({
    id: post.slug || String(i),
    path: post.publicPath || post.public_path || `/posts/${post.slug}`,
    image: post.media?.[0]?.url || null,
    imageKind: post.media?.[0]?.kind || 'image',
    text: post.summary || '',
    alt: post.summary || 'Post image',
    wide: i === 0,
  }))
})

const recentBlogPosts = computed(() =>
  (blogList.value || [])
    .filter(post => post.slug)
    .slice(0, 3)
    .map((post) => ({
      slug: String(post.slug || ''),
      title: String(post.title || 'Untitled'),
      excerpt: typeof post.excerpt === 'string' ? post.excerpt : '',
      category: typeof post.category === 'string' ? post.category : '',
      publishedAt: typeof post.published_at === 'string' ? post.published_at : null,
      image: resolveMedia(post.featured_image).url,
    }))
)

// Featured content — dishes or experiences, shown right below the hero
const featuredContent = computed(() => {
  const featuredItems = hasMenu.value ? featuredMenuItems.value : featuredExperiences.value
  return featuredItems.slice(0, 4).map(item => {
    if (hasMenu.value) {
      // For video assets use the extracted WebP thumbnail, not the MP4 URL.
      // Featured cards are small grid tiles — loading a video here wastes bandwidth
      // and causes a 300-500KB download before the card is even visible.
      const isVideo = item.kind === 'video'
      return {
        name: item.name,
        price: formatMoneyAmount(item.price_amount, defaultCurrency.value, ''),
        compareAtPrice: isSaleActive(item) ? formatMoneyAmount(item.compare_at_price_amount, defaultCurrency.value, '') : '',
        image: isVideo ? (item.thumbnail_url || null) : (item.public_url || null),
        imageKind: 'image',
        alt: item.name ? `${item.name} dish` : 'Featured dish image',
        href: item.slug ? `/menu/${item.slug}` : '/menu',
      }
    } else {
      return {
        name: item.title,
        ...resolveOverridePriceDisplay(item, defaultCurrency.value),
        image: item.image_url || null,
        imageKind: 'image',
        alt: item.title ? `${item.title} experience` : 'Featured experience image',
        href: item.slug ? `/experiences/${item.slug}` : '/experiences',
        unavailable: item.location_id ? closedLocationIds.value.has(item.location_id) : false,
      }
    }
  })
})

</script>
