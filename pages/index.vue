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
      <SayaHero
        id="section-hero"
        :title="getField('hero.title', 'Saya Kitchen')"
        :subtitle="getField('hero.subtitle', 'Authentic Japanese Robatayaki in Krabi, Thailand')"
        size="home"
        :video="getFieldStr('hero.video', '/videos/hero-video.mp4')"
        :establishment-year="googleBusiness.value?.business?.establishmentYear"
      >
        <template #cta>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <UButton to="/menu" variant="solid" color="neutral" size="xl">
              View Menu
            </UButton>
            <UButton v-if="hasLocations" :to="locationsCtaUrl" variant="outline" color="neutral" size="xl">
              {{ locationsCtaText }}
            </UButton>
            <UButton v-else to="/reservations" variant="outline" color="neutral" size="xl">
              Reserve a Table
            </UButton>
          </div>
        </template>
      </SayaHero>

      <!-- Location Cards/Picker -->
      <AppSection v-if="hasLocations" bg="white" padding="default">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-[var(--ui-text-highlighted)] mb-4">Our Locations</h2>
          <p class="text-xl text-[var(--ui-text-muted)]">Visit us at any of our convenient locations</p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AppCard
            v-for="location in locations"
            :key="location.id"
            variant="elevated"
            border="light"
            hoverable
            @click="navigateToLocation(location)"
          >
            <div v-if="location.image_url" class="aspect-video bg-[var(--ui-bg-elevated)] rounded-t-lg overflow-hidden">
              <img
                :src="location.image_url"
                :alt="location.title"
                class="w-full h-full object-cover"
              >
            </div>
            <div v-else class="aspect-video bg-[var(--ui-bg-elevated)] rounded-t-lg flex items-center justify-center">
              <svg class="w-12 h-12 text-[var(--ui-text-dimmed)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>

            <div class="p-6">
              <div class="flex items-start justify-between mb-2">
                <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ location.title }}</h3>
                <UBadge color="neutral" variant="soft" size="sm">Primary</UBadge>
              </div>

              <p v-if="location.address" class="text-[var(--ui-text-muted)] text-sm mb-3">{{ location.address }}</p>

              <div class="flex items-center text-sm text-[var(--ui-text-muted)]">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {{ location.city || 'Location' }}
              </div>
            </div>
          </AppCard>
        </div>
      </AppSection>

      <!-- Featured Menu Preview -->
      <AppSection v-if="hasMenu" bg="alt" padding="default">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-[var(--ui-text-highlighted)] mb-4">Featured Menu</h2>
          <p class="text-xl text-[var(--ui-text-muted)]">Taste our signature dishes</p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <AppCard
            v-for="item in featuredMenuItems"
            :key="item.id"
            variant="elevated"
            border="light"
            hoverable
          >
            <div class="flex justify-between items-start mb-4">
              <div>
                <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">{{ item.name }}</h3>
                <p v-if="item.description" class="text-[var(--ui-text-muted)] text-sm mt-1">{{ item.description }}</p>
              </div>
              <div v-if="item.price" class="text-lg font-bold text-[var(--ui-text-highlighted)] ml-4">
                {{ item.price }}
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span
                :class="[
                  'inline-flex items-center px-2 py-1 text-xs font-medium rounded',
                  item.available
                    ? 'bg-[var(--ui-bg-elevated)] text-[var(--ui-text)]'
                    : 'bg-red-100 text-red-800'
                ]"
              >
                {{ item.available ? 'Available' : 'Unavailable' }}
              </span>

              <UButton to="/menu" color="neutral" variant="outline" size="sm">View Full Menu</UButton>
            </div>
          </AppCard>
        </div>
      </AppSection>

      <!-- Reviews Summary -->
      <AppSection v-if="hasGoogleBusiness && googleReviewSummary" bg="white" padding="default">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-bold text-[var(--ui-text-highlighted)] mb-4">What Our Guests Say</h2>
          <div class="flex items-center justify-center gap-4">
            <div class="flex items-center">
              <div class="flex text-yellow-400">
                <svg v-for="i in 5" :key="i" class="w-5 h-5 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span class="text-2xl font-bold text-[var(--ui-text-highlighted)] ml-2">{{ googleReviewSummary.average }}</span>
            </div>
            <span class="text-[var(--ui-text-muted)]">({{ googleReviewSummary.count }} reviews)</span>
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div
            v-for="review in featuredReviews"
            :key="review.id"
            class="bg-[var(--ui-bg-muted)] rounded-lg p-6"
          >
            <div class="flex items-center mb-4">
              <div class="flex text-yellow-400">
                <svg v-for="i in review.rating" :key="i" class="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <span class="ml-2 text-sm text-[var(--ui-text-muted)]">{{ review.rating }}/5</span>
            </div>

            <p class="text-[var(--ui-text)] mb-3">{{ review.content }}</p>
            <p class="text-sm text-[var(--ui-text-muted)] font-medium">{{ review.author }}</p>
          </div>
        </div>
      </AppSection>
      <AppSection v-else bg="white" padding="default">
        <div class="mb-8 text-center">
          <h2 class="mb-3 text-3xl font-bold text-[var(--ui-text-highlighted)]">What Our Guests Say</h2>
          <p class="text-[var(--ui-text-muted)]">Connect Google Business to display fresh guest reviews.</p>
        </div>
        <div class="grid gap-8 md:grid-cols-3">
          <UCard v-for="i in 3" :key="`review-placeholder-${i}`" class="flex flex-col bg-[var(--ui-bg)] p-8 shadow-sm border border-[var(--ui-border-muted)]">
            <div class="mb-4 flex items-center gap-1">
              <span v-for="star in 5" :key="star" class="h-4 w-4 rounded bg-stone-200 animate-pulse" />
            </div>
            <div class="flex-grow space-y-3">
              <div class="h-3 rounded bg-stone-200 animate-pulse" />
              <div class="h-3 w-4/5 rounded bg-stone-200 animate-pulse" />
              <div class="h-3 w-3/4 rounded bg-stone-200 animate-pulse" />
            </div>
            <div class="mt-6 flex items-center gap-3 border-t border-gray-50 pt-6">
              <div class="h-10 w-10 rounded-full bg-stone-200 animate-pulse" />
              <div class="flex-1 space-y-2">
                <div class="h-4 w-28 rounded bg-stone-200 animate-pulse" />
                <div class="h-3 w-20 rounded bg-stone-200 animate-pulse" />
              </div>
            </div>
          </UCard>
        </div>
        <div v-if="isAuthenticated" class="mt-8 text-center">
          <NuxtLink to="/dashboard/integrations" class="font-semibold text-[var(--ui-text-highlighted)] underline decoration-[var(--ui-border-muted)] underline-offset-4 hover:decoration-[var(--ui-border)]">
            Connect Google Business →
          </NuxtLink>
        </div>
      </AppSection>

      <!-- Posts/News -->
      <ClientOnly>
        <SayaPosts :posts="googlePosts" :limit="3" show-view-more description="News, events and special offers" />
      </ClientOnly>

      <!-- About teaser -->
      <ClientOnly>
        <SayaAbout
          :title="getField('about-teaser-title', businessTitle)"
          :image="businessPrimaryPhoto?.googleUrl"
          is-teaser
          bg="black"
          padding="xl"
        >
          <p class="text-[var(--ui-text-inverted)] opacity-80 text-lg font-light leading-relaxed">
            {{ getField('cta.description', businessSubtitle) }}
          </p>
        </SayaAbout>
      </ClientOnly>

      <!-- Gallery -->
      <AppSection bg="white" padding="default">
        <div class="flex items-center justify-between mb-8">
          <h2 class="text-3xl font-bold text-[var(--ui-text-highlighted)] italic">Gallery</h2>
          <NuxtLink to="/photos" class="text-black font-semibold hover:underline">View All Photos →</NuxtLink>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <!-- Loaded photos -->
          <template v-if="googleMedia.length">
            <div v-for="media in googleMedia.slice(0, 4)" :key="media.name" class="aspect-square overflow-hidden rounded-2xl shadow-sm">
              <img
                :src="media.googleUrl"
                :alt="media.description || 'Restaurant Photo'"
                class="w-full h-full object-cover hover:scale-110 transition-transform duration-500"
              >
            </div>
          </template>
          <!-- Empty state placeholders -->
          <template v-else>
            <div v-for="photo in sayaGalleryPlaceholders" :key="photo.src" class="aspect-square overflow-hidden rounded-2xl shadow-sm">
              <img
                :src="photo.src"
                :alt="photo.alt"
                class="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
              >
            </div>
          </template>
        </div>
      </AppSection>

      <!-- Location & Hours -->
      <AppSection id="section-google" bg="alt" padding="default">
        <div class="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 class="text-3xl font-bold text-[var(--ui-text-highlighted)] mb-4 italic">
              Find Us{{ businessCity ? ` in ${businessCity}` : ' at Our Location' }}
            </h2>
            <div class="space-y-4 text-[var(--ui-text-muted)] mb-8">
              <!-- Address placeholder if not yet synced -->
              <div v-if="businessAddress">
                <p>{{ businessAddress }}</p>
              </div>
              <p v-else>123 Beach Road, Ao Nang, Krabi 81180</p>

              <div v-if="specialHoursNotice" class="flex items-start gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <span class="text-2xl">🗓️</span>
                <div>
                  <h3 class="font-bold text-amber-900 text-sm uppercase tracking-wider mb-1">Holiday Update</h3>
                  <p class="text-amber-800 text-sm font-medium">{{ specialHoursNotice }}</p>
                </div>
              </div>

              <p v-if="businessHours">{{ businessHours }}</p>
              <p v-else>Open daily, 5:00 PM - 10:30 PM</p>

              <p v-if="businessPhone">{{ businessPhone }}</p>
              <p v-else>+66 81 154 3606</p>
            </div>
            <div class="flex gap-4">
              <UButton to="/location" variant="solid" color="neutral" size="xl">Full Location Details</UButton>
              <UButton to="/reservations" variant="outline" color="neutral" size="xl">Reserve a Table →</UButton>
            </div>
          </div>
          <div class="rounded-3xl h-80 overflow-hidden shadow-2xl bg-[var(--ui-bg-elevated)]">
            <iframe
              v-if="businessCoordinates"
              :src="`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3950.432413181305!2d${businessCoordinates.lng}!3d${businessCoordinates.lat}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x305195cf958f130b%3A0xd8ce9d779ecb9325!2sYour%20Restaurant!5e0!3m2!1sen!2sth!4v1777770384431!5m2!1sen!2sth`"
              width="100%"
              height="100%"
              style="border:0;"
              allowfullscreen=""
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
            />
            <div v-else class="flex h-full w-full items-center justify-center bg-[var(--ui-bg)]">
              <div class="px-8 text-center">
                <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--ui-bg-muted)] text-[var(--ui-text-highlighted)]">
                  <UIcon name="i-simple-icons-googlemaps" class="size-7" />
                </div>
                <p class="text-base font-semibold text-[var(--ui-text-highlighted)]">Google Maps will appear here</p>
                <p class="mt-2 text-sm text-[var(--ui-text-muted)]">Connect Google Business to sync your verified location and directions.</p>
              </div>
            </div>
          </div>
        </div>
      </AppSection>

      <!-- CTA -->
      <AppSection id="section-cta" bg="black" padding="xl">
        <div class="text-center">
          <h2 class="text-3xl md:text-5xl font-bold text-white mb-6 italic">
            {{ getField('cta.title', 'Ready to Experience Saya Kitchen?') }}
          </h2>
          <p class="text-white/60 mb-10 max-w-2xl mx-auto font-light">
            {{ getField('cta.description', "From our open-flame robatayaki grill to hand-rolled sushi, every dish at Saya is crafted with intention. Join us for an evening you won't forget.") }}
          </p>
          <div class="flex flex-col md:flex-row items-center justify-center gap-6">
            <UButton to="/reservations" variant="solid" color="neutral" size="xl" class="bg-[var(--ui-bg)] text-[var(--ui-text)] hover:bg-[var(--ui-bg-elevated)]">
              Reserve a Table
            </UButton>
            <UButton to="/contact" variant="outline" color="neutral" size="xl" class="border-[var(--ui-border)] text-[var(--ui-text-inverted)] hover:bg-[var(--ui-bg)]/10">
              Contact Us
            </UButton>
          </div>
        </div>
      </AppSection>
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

// Navigate to location
const navigateToLocation = (location) => {
  navigateTo(`/locations/${location.slug}`)
}

</script>
