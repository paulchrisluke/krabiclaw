<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">
    <!-- KrabiClaw Platform Homepage -->
    <div v-if="isPlatform" class="bg-(--ui-bg)">

      <!-- Hero -->
      <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div class="flex flex-col gap-6">
          <!-- Eyebrow -->
          <span class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full">
            <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0" />
            New · AI menu translator
          </span>

          <!-- Headline -->
          <h1 class="text-[clamp(40px,5vw,64px)] font-extrabold leading-[1.02] tracking-tight text-default text-balance m-0">
            Build, grow, and manage your <span class="text-(--kc-coral)">restaurant</span> online.
          </h1>

          <p class="text-lg leading-relaxed text-muted m-0 max-w-lg">
            The Shopify for restaurants. Beautiful sites, AI-powered content, Google Business sync — in one tidy little dashboard.
          </p>

          <!-- CTAs -->
          <div class="flex flex-wrap gap-3">
            <NuxtLink
              to="/signup"
              class="inline-flex items-center gap-2 bg-(--kc-coral) text-white font-semibold text-[15px] px-6 py-3.5 rounded-[10px] hover:opacity-90 transition-opacity no-underline"
            >
              Start free
              <UIcon name="i-heroicons-arrow-right" class="size-4" />
            </NuxtLink>
            <NuxtLink
              to="/templates"
              class="inline-flex items-center bg-transparent text-(--kc-teal-600) border border-(--kc-teal) font-semibold text-[15px] px-6 py-3.5 rounded-full hover:bg-(--kc-teal-100) transition-colors no-underline"
            >
              See live demo
            </NuxtLink>
          </div>

          <!-- Social proof -->
          <div class="flex items-center gap-3 mt-2">
            <div class="flex">
              <div
                v-for="(av, i) in avatars"
                :key="i"
                class="w-8 h-8 rounded-full border-2 border-(--ui-bg) flex items-center justify-center text-white text-xs font-bold -ml-2 first:ml-0"
                :style="{ background: av.color }"
              >{{ av.letter }}</div>
            </div>
            <p class="text-[13px] text-muted m-0">
              Trusted by <strong class="text-default">1,200+ restaurants</strong> across SE Asia
            </p>
          </div>
        </div>

        <!-- Mascot / hero visual -->
        <div class="hidden lg:flex justify-center">
          <div class="bg-(--kc-coral-50) rounded-[32px] p-7 shadow-xl max-w-lg w-full">
            <img
              src="/krabiclaw-login-mascot.png"
              alt="KrabiClaw mascot"
              class="w-full block rounded-[20px]"
            >
          </div>
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="bg-elevated border-y border-default py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-12 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-muted">Everything your restaurant needs</span>
            <h2 class="text-[44px] font-extrabold tracking-tight leading-[1.05] text-default m-0">One platform. No plugins. No fuss.</h2>
          </div>
          <div class="grid md:grid-cols-3 gap-5">
            <div
              v-for="feat in features"
              :key="feat.title"
              class="rounded-[18px] p-7 border border-(--ui-border)"
              :class="feat.dark
                ? 'bg-(--kc-navy)'
                : feat.muted
                  ? 'bg-stone-50 dark:bg-stone-800/60 shadow-none'
                  : 'bg-white dark:bg-(--kc-navy-700) shadow-[0_1px_3px_rgba(31,37,71,0.04)]'"
            >
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                :class="feat.dark ? 'bg-(--kc-coral)' : 'bg-(--kc-navy) dark:bg-(--kc-navy-500)'"
              >
                <UIcon :name="feat.icon" class="size-5 text-white" />
              </div>
              <h3 class="text-lg font-bold mb-2 m-0"
                :class="feat.dark
                  ? 'text-white'
                  : 'text-default'"
              >{{ feat.title }}</h3>
              <p class="text-[14px] leading-relaxed m-0"
                :class="feat.dark
                  ? 'text-white/75'
                  : 'text-muted'"
              >{{ feat.body }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Pricing -->
      <section class="bg-(--ui-bg) py-20">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto mb-12 flex flex-col items-center gap-4">
            <span class="kc-eyebrow text-(--ui-text-dimmed)">Simple pricing</span>
            <h2 class="text-[44px] font-extrabold tracking-tight leading-[1.05] text-default m-0">Start free. Grow when you're ready.</h2>
          </div>
          <div class="grid md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <!-- Free -->
            <div class="bg-elevated border border-default rounded-[20px] p-8 relative">
              <div class="text-[14px] font-semibold text-muted uppercase tracking-[0.18em] mb-4">Free</div>
              <div class="flex items-baseline gap-2 mb-1.5">
                <span class="text-[56px] font-extrabold text-default tracking-tight leading-none">$0</span>
                <span class="text-[14px] text-muted">forever</span>
              </div>
              <ul class="mt-5 mb-6 space-y-2.5">
                <li v-for="f in freePlan" :key="f" class="flex items-center gap-2.5 text-[14px] text-default">
                  <UIcon name="i-heroicons-check" class="size-4 text-(--kc-teal) shrink-0" />
                  {{ f }}
                </li>
              </ul>
              <NuxtLink to="/signup" class="block text-center font-semibold text-[14px] py-3.5 rounded-[10px] bg-(--ui-bg-inverted) text-inverted hover:opacity-90 transition-opacity no-underline">
                Start free
              </NuxtLink>
            </div>
            <!-- Pro -->
            <div class="bg-(--ui-bg-inverted) rounded-[20px] p-8 relative shadow-[0_24px_48px_rgba(31,37,71,0.18)]">
              <div class="absolute -top-3 right-5 bg-(--kc-coral) text-white text-[11px] font-bold tracking-[0.18em] px-3 py-1.5 rounded-full uppercase">Most popular</div>
              <div class="text-[14px] font-semibold text-(--kc-coral-200) uppercase tracking-[0.18em] mb-4">Pro</div>
              <div class="flex items-baseline gap-2 mb-1.5">
                <span class="text-[56px] font-extrabold text-white tracking-tight leading-none">$25</span>
                <span class="text-[14px] text-white/70">per location / mo</span>
              </div>
              <ul class="mt-5 mb-6 space-y-2.5">
                <li v-for="f in proPlan" :key="f" class="flex items-center gap-2.5 text-[14px] text-white/85">
                  <UIcon name="i-heroicons-check" class="size-4 text-(--kc-coral) shrink-0" />
                  {{ f }}
                </li>
              </ul>
              <NuxtLink to="/signup" class="block text-center font-semibold text-[14px] py-3.5 rounded-[10px] bg-(--kc-coral) text-white hover:opacity-90 transition-opacity no-underline">
                Get Started
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>
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
                  <img :src="tile.image" :alt="tile.alt || tile.name || `${tile.type} image`" class="h-full w-full object-cover" >
                </div>
                <div class="p-5 pt-4">
                  <p class="saya-eyebrow mb-2 text-muted">Google Post</p>
                  <p class="text-sm leading-relaxed text-default line-clamp-3">{{ tile.text }}</p>
                </div>
              </article>

              <!-- Dish tile -->
              <article v-else-if="tile.type === 'dish'" class="overflow-hidden bg-default">
                <div v-if="tile.image" class="aspect-square overflow-hidden bg-muted">
                  <img :src="tile.image" :alt="tile.alt || tile.name || `${tile.type} image`" class="h-full w-full object-cover" >
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
      <section class="bg-(--ui-bg-inverted) text-(--ui-text-inverted)">
        <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <p class="saya-eyebrow mb-8 text-(--ui-text-inverted)/60">Our story</p>

          <!-- Filled state -->
          <template v-if="getField('story.headline') || hasGoogleBusiness">
            <h2 class="saya-display-md max-w-3xl text-(--ui-text-inverted)">
              {{ getField('story.headline', businessTitle) }}
            </h2>
            <p class="mt-8 max-w-2xl text-base leading-relaxed text-(--ui-text-inverted)/60">
              {{ getField('story.body', businessSubtitle) }}
            </p>
            <NuxtLink
              to="/about"
              class="mt-8 inline-block border-b border-(--ui-text-inverted) pb-1 text-xs uppercase tracking-widest text-(--ui-text-inverted) no-underline transition hover:opacity-60"
            >
              Read more →
            </NuxtLink>
          </template>

          <!-- Empty state: owner hasn't added story yet -->
          <template v-else>
            <h2 class="saya-display-md max-w-3xl text-(--ui-text-inverted)/30">Your brand story goes here.</h2>
            <p class="mt-6 max-w-lg text-sm leading-relaxed text-(--ui-text-inverted)/30">
              Two or three sentences about your restaurant — what you cook, how you cook it, why it matters.
            </p>
            <NuxtLink
              v-if="isAuthenticated"
              to="/dashboard/sites"
              class="mt-8 inline-flex items-center gap-2 rounded-full border border-(--ui-text-inverted)/20 px-5 py-2.5 text-xs uppercase tracking-widest text-(--ui-text-inverted)/60 no-underline transition hover:border-(--ui-text-inverted)/40 hover:text-(--ui-text-inverted)/80"
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
        <UButton to="/reservations" color="primary" variant="solid" size="xl" class="rounded-full">
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
import { useOrganizationSchema } from '~/composables/useSchemaOrg'

definePageMeta({ layout: false })

const { isPlatform, siteId } = useTenantSite()

// Platform homepage data
const avatars = [
  { color: '#FB7461', letter: 'S' },
  { color: '#2BB5B5', letter: 'K' },
  { color: '#F8C546', letter: 'M' },
  { color: '#1F2547', letter: 'A' },
]
const features = [
  { icon: 'i-heroicons-paint-brush', title: 'Beautiful themes', body: 'Conversion-optimized themes built for restaurants. Pick one, swap a color, you\'re live.' },
  { icon: 'i-heroicons-sparkles', title: 'AI-powered content', body: 'Mouth-watering descriptions, allergens, translations — generated in one click.', muted: true },
  { icon: 'i-heroicons-globe-alt', title: 'Google Business sync', body: 'Hours, photos, menu — pushed to Google so guests find the right info every time.' },
  { icon: 'i-heroicons-calendar-days', title: 'Reservations + waitlist', body: 'Take bookings 24/7 with WhatsApp confirmations. Walk-ins go on the waitlist automatically.', dark: true },
  { icon: 'i-heroicons-shopping-bag', title: 'Online ordering', body: 'Pickup & delivery with no commission. Stripe payouts straight to your bank.' },
  { icon: 'i-heroicons-chart-bar', title: 'Real-time insights', body: 'See covers, top dishes, busy hours — all in one dashboard.' },
]
const freePlan = ['1 location', 'Beautiful Saya theme', 'Online menu', 'Google Business sync']
const proPlan = ['Everything in Free', 'Reservations + waitlist', 'AI content writer', 'Custom domain', 'Remove KrabiClaw badge']
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
  useOrganizationSchema()
  
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

// Aggregated highlights — mix posts, dishes, review quotes (max 7 tiles)
const highlights = computed(() => {
  const tiles = []

  // Up to 2 GMB posts with photos
  const posts = (googlePosts.value || []).filter(p => p.media?.[0]?.googleUrl)
  for (let i = 0; i < Math.min(2, posts.length); i++) {
    const post = posts[i]
    const image = post?.media?.[0]?.googleUrl || null
    tiles.push({
      type: 'post',
      image,
      text: post?.summary || post?.name,
      alt: post?.summary || post?.name || 'Google post image',
      wide: i === 0
    })
  }

  // Up to 3 featured dishes
  for (let i = 0; i < Math.min(3, featuredMenuItems.value.length); i++) {
    const item = featuredMenuItems.value[i]
    tiles.push({ type: 'dish', name: item.name, price: item.price, image: item.image_url || null, alt: item.name ? `${item.name} dish` : 'Featured dish image' })
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
