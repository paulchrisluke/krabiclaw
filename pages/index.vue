<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">
    <!-- KrabiClaw Platform Homepage -->
    <div v-if="isPlatform" class="krabiclaw-platform">
      <SayaHero
        id="section-hero"
        title="KrabiClaw"
        subtitle="The AI-powered restaurant platform. Build your digital presence in minutes."
        size="home"
        bg="black"
      >
        <template #cta>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <UButton
              to="/signup"
              variant="outline"
              size="xl"
              color="neutral"
              class="border-[var(--ui-border)] text-[var(--ui-text-inverted)] hover:bg-[var(--ui-bg)]/10"
            >
              Start Free
            </UButton>
            <UButton to="/pricing" size="xl" color="neutral">View Pricing</UButton>
          </div>
        </template>
      </SayaHero>

      <!-- Platform features section -->
      <AppSection id="features" bg="white" padding="xl">
        <div class="text-center mb-16">
          <h2 class="text-4xl font-bold text-[var(--ui-text-highlighted)] mb-4 tracking-tight">
            Everything your restaurant needs to thrive online
          </h2>
          <p class="text-xl text-[var(--ui-text-muted)] max-w-2xl mx-auto">
            Professional websites with AI-powered content, Google Business integration, and seamless reservation management.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-12">
          <UCard class="bg-[var(--ui-bg-muted)] border border-[var(--ui-border-muted)]">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6">
              <span class="text-white text-2xl">🎨</span>
            </div>
            <h3 class="text-xl font-bold mb-3 text-[var(--ui-text-highlighted)]">Beautiful Themes</h3>
            <p class="text-[var(--ui-text-muted)] leading-relaxed">
              Choose from premium, conversion-optimized restaurant themes that look stunning on any device.
            </p>
          </UCard>

          <UCard class="bg-[var(--ui-bg-muted)] border border-[var(--ui-border-muted)]">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6">
              <span class="text-white text-2xl">🤖</span>
            </div>
            <h3 class="text-xl font-bold mb-3 text-[var(--ui-text-highlighted)]">AI-Powered Content</h3>
            <p class="text-[var(--ui-text-muted)] leading-relaxed">
              Our AI helps you write compelling copy, generate mouth-watering descriptions, and optimize for SEO.
            </p>
          </UCard>

          <UCard class="bg-[var(--ui-bg-muted)] border border-[var(--ui-border-muted)]">
            <div class="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6">
              <span class="text-white text-2xl">📊</span>
            </div>
            <h3 class="text-xl font-bold mb-3 text-[var(--ui-text-highlighted)]">Google Sync</h3>
            <p class="text-[var(--ui-text-muted)] leading-relaxed">
              Automatically sync your reviews, photos, and business hours directly from your Google Business Profile.
            </p>
          </UCard>
        </div>
      </AppSection>

      <!-- CTA Section -->
      <AppSection bg="black" padding="xl">
        <div class="text-center">
          <h2 class="text-4xl font-bold mb-6 italic text-white">Ready to grow your restaurant?</h2>
          <p class="text-[var(--ui-text-dimmed)] text-xl mb-10">Join hundreds of restaurants building their future with KrabiClaw.</p>
          <UButton
            to="/signup"
            variant="solid"
            color="neutral"
            size="xl"
            class="bg-[var(--ui-bg)] text-[var(--ui-text)] hover:bg-[var(--ui-bg-elevated)]"
          >
            Get Started for Free
          </UButton>
        </div>
      </AppSection>
    </div>

    <!-- Saya Restaurant Theme (Tenant Site) -->
    <div v-else class="saya-restaurant-theme">

      <!-- ── Brand hero ─────────────────────────────────────── -->
      <section class="relative min-h-160 overflow-hidden flex items-center">
        <!-- Background photo -->
        <div
          v-if="businessPrimaryPhoto"
          class="absolute inset-0 bg-cover bg-center opacity-50"
          :style="`background-image: url(${businessPrimaryPhoto.googleUrl})`"
        />
        <div class="absolute inset-0 bg-zinc-950" :class="businessPrimaryPhoto ? 'opacity-50' : ''" />
        <div class="relative mx-auto w-full max-w-7xl px-4 py-36 sm:px-6 lg:px-8">
          <p class="saya-eyebrow mb-8 text-white/70">
            {{ getField('hero.eyebrow', businessCity || 'A neighbourhood restaurant') }}
          </p>
          <h1 class="saya-display-lg text-white max-w-4xl">
            {{ getField('hero.title', businessTitle) }}<br>
            <em class="saya-italic">{{ getField('hero.subtitle', businessSubtitle) }}</em>
          </h1>

          <!-- Location pills -->
          <div v-if="hasLocations" class="mt-12 flex flex-wrap gap-3">
            <NuxtLink
              v-for="loc in locations"
              :key="loc.id"
              :to="`/locations/${loc.slug}`"
              class="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/5 px-5 py-2.5 text-sm text-white backdrop-blur-sm no-underline transition hover:bg-white/10"
            >
              <UIcon name="i-heroicons-map-pin" class="size-3.5 opacity-70" />
              {{ loc.title }}
            </NuxtLink>
          </div>
          <div v-else class="mt-12 flex flex-wrap gap-4">
            <UButton to="/reservations" color="neutral" variant="solid" size="xl" class="rounded-full bg-white! text-black! hover:bg-zinc-100!">Reserve a table</UButton>
          </div>
        </div>
      </section>

      <!-- ── Locations grid ─────────────────────────────────── -->
      <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <p class="saya-kicker mb-6">Find us</p>
          <h2 class="saya-display-md text-default">
            {{ locations.length }} location{{ locations.length === 1 ? '' : 's' }}, one kitchen philosophy.
          </h2>
        </div>
        <!-- Real locations -->
        <div v-if="hasLocations" :class="['grid gap-8', locations.length > 1 ? 'md:grid-cols-2' : '']">
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}`"
            class="group block overflow-hidden border border-default text-default no-underline transition hover:border-muted"
          >
            <div class="aspect-video overflow-hidden bg-muted">
              <img
                v-if="loc.image_url"
                :src="loc.image_url"
                :alt="loc.title"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              >
              <div v-else class="flex h-full w-full items-center justify-center">
                <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
              </div>
            </div>
            <div class="p-8 pb-9">
              <div class="saya-eyebrow mb-5 flex items-center gap-2 text-muted">
                <span class="size-1.5 rounded-full bg-zinc-300" />
                {{ loc.city || 'Location' }}
              </div>
              <div class="saya-display saya-italic text-4xl text-default leading-none">{{ loc.title }}</div>
              <div class="mt-6 border-t border-default pt-5">
                <span class="saya-eyebrow text-muted">Visit this location →</span>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Empty state: no locations yet -->
        <div v-else class="grid gap-8 md:grid-cols-2">
          <div
            v-for="i in 2"
            :key="i"
            class="overflow-hidden border border-dashed border-default"
          >
            <div class="flex aspect-video items-center justify-center bg-muted">
              <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
            </div>
            <div class="p-8 pb-9">
              <div class="saya-display saya-italic text-4xl text-muted leading-none">
                {{ i === 1 ? 'Main location' : 'Second location' }}
              </div>
              <p class="mt-4 text-sm text-muted">
                {{ i === 1 ? 'Connect Google Business to sync your address, hours, photos and reviews.' : 'Add a second location once your first is connected.' }}
              </p>
            </div>
          </div>
          <div v-if="isAuthenticated" class="md:col-span-2 text-center pt-2">
            <UButton to="/dashboard/integrations" color="neutral" variant="outline" size="sm" class="rounded-full">
              Connect Google Business →
            </UButton>
          </div>
        </div>
      </section>

      <!-- ── Aggregated highlights ───────────────────────────── -->
      <section v-if="highlights.length" class="bg-elevated">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div class="mb-16 max-w-2xl">
            <p class="saya-kicker mb-6">Lately</p>
            <h2 class="saya-display-md text-default">Posts, reviews &amp; dishes from across the brand.</h2>
            <p class="mt-6 text-sm leading-relaxed text-muted">Updates automatically from Google Business across every location.</p>
          </div>
          <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <template v-for="(tile, i) in highlights" :key="i">
              <!-- Post tile -->
              <article
                v-if="tile.type === 'post'"
                class="overflow-hidden bg-default"
                :class="tile.wide ? 'sm:col-span-2' : ''"
              >
                <div v-if="tile.image" class="overflow-hidden bg-muted" :class="tile.wide ? 'aspect-video' : 'aspect-square'">
                  <img :src="tile.image" alt="" class="h-full w-full object-cover" >
                </div>
                <div class="p-5 pt-4">
                  <p class="saya-eyebrow mb-2 text-muted">Google Post</p>
                  <p class="text-sm leading-relaxed text-default line-clamp-3">{{ tile.text }}</p>
                </div>
              </article>

              <!-- Dish tile -->
              <article v-else-if="tile.type === 'dish'" class="overflow-hidden bg-default">
                <div v-if="tile.image" class="aspect-square overflow-hidden bg-muted">
                  <img :src="tile.image" alt="" class="h-full w-full object-cover" >
                </div>
                <div class="p-5 pt-4">
                  <p class="saya-eyebrow mb-2 text-muted">Featured</p>
                  <p class="saya-display saya-italic text-xl text-default leading-snug">{{ tile.name }}</p>
                  <p v-if="tile.price" class="mt-1 text-sm tabular-nums text-muted">{{ tile.price }}</p>
                </div>
              </article>

              <!-- Review quote tile -->
              <article v-else-if="tile.type === 'review'" class="bg-default p-6 flex flex-col">
                <UIcon name="i-heroicons-chat-bubble-left" class="mb-4 size-6 text-muted opacity-30" />
                <p class="saya-display saya-italic text-xl text-default leading-snug flex-1">"{{ tile.text }}"</p>
                <p class="mt-4 text-xs text-muted">{{ tile.author }}</p>
              </article>
            </template>
          </div>
        </div>
      </section>

      <!-- ── Brand story ─────────────────────────────────────── -->
      <section class="bg-inverted text-inverted">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <p class="saya-eyebrow mb-8 text-white/60">Our story</p>

          <!-- Filled state -->
          <template v-if="getField('story.headline') || businessTitle !== 'Saya Kitchen'">
            <h2 class="saya-display-md max-w-3xl text-white">
              {{ getField('story.headline', businessTitle) }}
            </h2>
            <p class="mt-8 max-w-2xl text-base leading-relaxed text-zinc-400">
              {{ getField('story.body', businessSubtitle) }}
            </p>
            <NuxtLink
              to="/about"
              class="mt-8 inline-block border-b border-white pb-1 text-xs uppercase tracking-widest text-white no-underline transition hover:opacity-60"
            >
              Read more →
            </NuxtLink>
          </template>

          <!-- Empty state: owner hasn't added story yet -->
          <template v-else>
            <h2 class="saya-display-md max-w-3xl text-white/30">Your brand story goes here.</h2>
            <p class="mt-6 max-w-lg text-sm leading-relaxed text-white/30">
              Two or three sentences about your restaurant — what you cook, how you cook it, why it matters.
            </p>
            <NuxtLink
              v-if="isAuthenticated"
              to="/dashboard/sites"
              class="mt-8 inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2.5 text-xs uppercase tracking-widest text-white/60 no-underline transition hover:border-white/40 hover:text-white/80"
            >
              Add your story in the dashboard →
            </NuxtLink>
          </template>
        </div>
      </section>

      <!-- ── Aggregated reviews ──────────────────────────────── -->
      <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div class="mb-16 max-w-2xl">
          <p class="saya-kicker mb-6">Reviews</p>
          <template v-if="hasGoogleBusiness && googleReviewSummary">
            <h2 class="saya-display-md flex flex-wrap items-center gap-4 text-default">
              <UIcon name="i-heroicons-star-solid" class="size-8 text-primary" />
              {{ googleReviewSummary.average }}
              <span class="text-muted">· {{ googleReviewSummary.count?.toLocaleString() }} reviews</span>
            </h2>
            <p class="mt-6 text-sm text-muted">Synced live from Google Business across all locations.</p>
          </template>
          <template v-else>
            <h2 class="saya-display-md text-default">What your guests say.</h2>
            <p class="mt-6 text-sm text-muted">
              Connect Google Business to automatically display fresh guest reviews here.
            </p>
            <NuxtLink
              v-if="isAuthenticated"
              to="/dashboard/integrations"
              class="mt-4 inline-block text-xs uppercase tracking-widest text-default no-underline underline-offset-4 hover:underline"
            >
              Connect Google Business →
            </NuxtLink>
          </template>
        </div>

        <!-- Real reviews -->
        <div v-if="featuredReviews.length" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="review in featuredReviews"
            :key="review.id"
            class="bg-elevated p-8"
          >
            <div class="mb-3 flex gap-1">
              <UIcon
                v-for="s in 5"
                :key="s"
                name="i-heroicons-star-solid"
                class="size-3.5"
                :class="s <= googleReviewRating(review) ? 'text-primary' : 'text-muted'"
              />
            </div>
            <p class="text-sm leading-relaxed text-default">"{{ review.comment?.text || review.content }}"</p>
            <div class="mt-6 border-t border-default pt-4">
              <p class="text-sm font-medium text-default">{{ review.reviewer?.displayName || review.author_name }}</p>
            </div>
          </div>
        </div>

        <!-- Placeholder review cards -->
        <div v-else class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="i in 3" :key="i" class="bg-elevated p-8">
            <div class="mb-4 flex gap-1">
              <span v-for="s in 5" :key="s" class="size-3.5 rounded-sm bg-zinc-200" />
            </div>
            <div class="space-y-2">
              <div class="h-3 rounded bg-zinc-200 animate-[sayaPulse_1.6s_ease-in-out_infinite]" />
              <div class="h-3 w-4/5 rounded bg-zinc-200 animate-[sayaPulse_1.6s_ease-in-out_infinite]" />
              <div class="h-3 w-3/5 rounded bg-zinc-200 animate-[sayaPulse_1.6s_ease-in-out_infinite]" />
            </div>
            <div class="mt-6 flex items-center gap-3 border-t border-default pt-4">
              <div class="size-8 rounded-full bg-zinc-200 animate-[sayaPulse_1.6s_ease-in-out_infinite]" />
              <div class="h-3 w-24 rounded bg-zinc-200 animate-[sayaPulse_1.6s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      </section>

      <!-- ── CTA strip ───────────────────────────────────────── -->
      <section class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-8 px-4 py-20 pb-28 sm:px-6 lg:px-8">
        <h3 class="saya-display saya-italic text-5xl text-default leading-none">
          {{ getField('cta.title', 'Come hungry.') }}
        </h3>
        <UButton to="/reservations" color="neutral" variant="solid" size="xl" class="rounded-full">
          Reserve a table
        </UButton>
      </section>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { getTodayGoogleHours, getSpecialHoursNotice } from '~/utils/formatters'
import { usePageContent } from '~/composables/usePageContent'
import { useTenantSite } from '~/composables/useTenantSite'
import { usePublicMenu } from '~/composables/usePublicMenu'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: false })

const { isPlatform, siteId } = useTenantSite()
const { getField, getFieldStr } = usePageContent('home')
const { isAuthenticated } = useAuth()

// Validate tenant context ONLY for tenant sites
if (!isPlatform && !siteId) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site not found'
  })
}

// Hoist platform hostname as a plain string for both platform and tenant
const config = useRuntimeConfig()
const platformHostname = config.public.freeSiteDomain?.replace(/^https?:\/\//, '') || 'krabiclaw.com'

// SEO for KrabiClaw Platform
if (isPlatform) {
  useSeoMeta({
    title: 'KrabiClaw | AI Restaurant Website Builder',
    description: 'Build your restaurant website in minutes with AI. No coding required.',
    ogTitle: 'KrabiClaw | AI Restaurant Website Builder',
    ogDescription: 'Professional restaurant websites with AI content and Google Business integration.',
    ogImage: '/og-krabiclaw.jpg',
    ogUrl: `https://${platformHostname}`,
    ogType: 'website'
  })
}

// SEO for tenant sites: set ogUrl to the tenant’s actual site URL
if (!isPlatform && siteId) {
  // Try to get subdomain from site context if available
  const subdomain = getFieldStr ? getFieldStr('site.subdomain', null) : null
  const tenantSubdomain = subdomain || 'restaurant'
  useSeoMeta({
    title: 'KrabiClaw | Beautiful Restaurant Websites. Powered by AI.',
    description: 'Professional restaurant websites with AI-powered content and Google Business integration.',
    ogImage: '/og-image.jpg',
    ogUrl: `https://${tenantSubdomain}.${platformHostname}`,
    ogType: 'website'
  })
}

// Get locations data (tenant-scoped) - Only if not platform
const { data: locationsData } = isPlatform
  ? { data: ref({ locations: [] }) }
  : await useFetch(`/api/public/sites/${siteId}/locations`, {
      key: 'locations-data',
      default: () => ({ locations: [] })
    })

const locations = computed(() => locationsData.value?.locations || [])
const hasLocations = computed(() => locations.value.length > 0)

// Location CTA logic
const locationsCtaUrl = computed(() => {
  if (locations.value.length === 1) {
    return `/locations/${locations.value[0].slug}`
  }
  return '/locations'
})

const locationsCtaText = computed(() => {
  if (locations.value.length === 1) {
    return 'View Location'
  }
  return 'Choose Location'
})

// Get brand menu for preview
const {
  menu,
  hasMenu,
  menuItemsBySection
} = isPlatform ? { menu: ref(null), hasMenu: ref(false), menuItemsBySection: ref({}) } : usePublicMenu(siteId, null)

// Featured menu items (first 6 items from all sections)
const featuredMenuItems = computed(() => {
  if (!menu.value) return []
  const allItems = Object.values(menuItemsBySection.value).flat()
  return allItems.slice(0, 6)
})

// Google Business data (tenant-scoped)
const { data: googleBusiness } = isPlatform
  ? { data: ref({ business: null, reviews: [], media: [], posts: [] }) }
  : await useFetch(`/api/public/sites/${siteId}/google-business`, {
      key: 'google-business-public',
      default: () => ({ business: null, reviews: [], media: [], posts: [] })
    })

const starRatingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }
const sayaGalleryPlaceholders = [
  {
    src: 'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=900&q=80',
    alt: 'Assorted sushi on a dark plate'
  },
  {
    src: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=900&q=80',
    alt: 'Grilled skewers over flame'
  },
  {
    src: 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?auto=format&fit=crop&w=900&q=80',
    alt: 'Japanese ramen and side dishes'
  },
  {
    src: 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?auto=format&fit=crop&w=900&q=80',
    alt: 'Fresh sushi rolls with garnish'
  }
]

const businessTitle = computed(() => googleBusiness.value?.business?.title || 'Saya Kitchen')
const businessSubtitle = computed(() => googleBusiness.value?.business?.profile?.description || 'Authentic Japanese Robatayaki in Krabi, Thailand')
const businessPrimaryPhoto = computed(() => googleBusiness.value?.media?.[0])
const businessAddress = computed(() => {
  const addr = googleBusiness.value?.business?.storefrontAddress
  if (!addr) return ''
  return `${addr.addressLines?.[0] || ''}, ${addr.locality || ''}, ${addr.administrativeArea || ''} ${addr.postalCode || ''}`.replace(/^,\s*/, '')
})
const businessCity = computed(() => googleBusiness.value?.business?.storefrontAddress?.locality || '')
const businessPhone = computed(() => googleBusiness.value?.business?.phoneNumbers?.[0]?.phoneNumber || '')
const businessHours = computed(() => getTodayGoogleHours(googleBusiness.value?.business?.regularHours))
const specialHoursNotice = computed(() => getSpecialHoursNotice(googleBusiness.value?.business?.specialHours))
const googlePosts = computed(() => googleBusiness.value?.posts || [])
const googleMedia = computed(() => googleBusiness.value?.media || [])
const businessCoordinates = computed(() => {
  const coords = googleBusiness.value?.business?.latlng
  return coords ? { lat: coords.latitude, lng: coords.longitude } : null
})
const googleReviews = computed(() => googleBusiness.value?.reviews ?? [])
const googleReviewRating = review => starRatingMap[review.starRating] ?? Number(review.starRating ?? 0)
const googleReviewSummary = computed(() => {
  const summary = googleBusiness.value?.business?.reviewSummary
  if (!summary) {
    const ratings = googleReviews.value.map(googleReviewRating).filter(Boolean)
    if (ratings.length === 0) return null
    return { average: (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1), count: ratings.length }
  }
  return { average: Number(summary.averageRating).toFixed(1), count: summary.totalReviewCount }
})

const hasGoogleBusiness = computed(() => !!googleBusiness.value?.business)
const featuredReviews = computed(() => googleReviews.value.slice(0, 3))

// Aggregated highlights — mix posts, dishes, review quotes (max 6 tiles)
const highlights = computed(() => {
  const tiles = []

  // Up to 2 GMB posts with photos
  const posts = (googlePosts.value || []).filter(p => p.media?.[0]?.googleUrl)
  for (let i = 0; i < Math.min(2, posts.length); i++) {
    tiles.push({ type: 'post', image: posts[i].media[0].googleUrl, text: posts[i].summary || posts[i].name, wide: i === 0 })
  }

  // Up to 3 featured dishes
  for (let i = 0; i < Math.min(3, featuredMenuItems.value.length); i++) {
    const item = featuredMenuItems.value[i]
    tiles.push({ type: 'dish', name: item.name, price: item.price, image: item.image_url || null })
  }

  // Up to 2 review quotes
  const reviews = googleReviews.value.filter(r => (r.comment?.text || r.content)?.length > 40)
  for (let i = 0; i < Math.min(2, reviews.length); i++) {
    const r = reviews[i]
    tiles.push({ type: 'review', text: (r.comment?.text || r.content || '').slice(0, 160), author: r.reviewer?.displayName || r.author_name || 'Guest' })
  }

  return tiles.slice(0, 7)
})

</script>
