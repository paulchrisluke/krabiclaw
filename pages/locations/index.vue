<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Page header -->
    <header class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ locationsCopy.findUsKicker }}</p>
      <h1 class="saya-display-md text-default">
        {{ locationsCopy.locationGroupLine(locations.length) }}
      </h1>
    </header>

    <!-- Loading -->
    <div v-if="pending" class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div :class="['grid gap-8', 'md:grid-cols-2']">
        <div v-for="i in 2" :key="i" class="overflow-hidden border border-default">
          <div class="aspect-16/10 animate-[sayaPulse_1.6s_ease-in-out_infinite] bg-muted" />
          <div class="p-8 space-y-3">
            <USkeleton class="h-8 w-48" />
            <USkeleton class="h-4 w-28" />
            <USkeleton class="mt-4 h-3 w-full" />
            <USkeleton class="h-3 w-2/3" />
          </div>
        </div>
      </div>
    </div>

    <!-- Locations grid -->
    <div v-else class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div
        v-if="locations.length"
        :class="['grid gap-8', locations.length === 1 ? '' : 'md:grid-cols-2']"
      >
        <NuxtLink
          v-for="loc in locations"
          :key="loc.id"
          :to="`/locations/${loc.slug}`"
          class="group block overflow-hidden border border-default text-default no-underline transition-colors hover:border-muted"
        >
          <!-- Photo -->
          <div class="aspect-16/10 overflow-hidden bg-muted">
            <video
              v-if="loc.public_url && loc.kind === 'video'"
              :src="loc.public_url"
              autoplay
              muted
              loop
              playsinline
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <img
              v-else-if="loc.public_url"
              :src="loc.public_url"
              :alt="loc.title"
              class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            >
            <div v-else class="flex h-full w-full items-center justify-center">
              <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
            </div>
          </div>

          <!-- Body -->
          <div class="p-8 pb-9">
            <!-- Open now meta -->
            <div class="saya-eyebrow mb-5 flex items-center gap-2 text-muted">
              <span class="size-1.5 rounded-full" :class="loc.open_now ? 'bg-green-400' : 'bg-zinc-300'" />
              {{ loc.open_now ? locationsCopy.openNowLabel : locationsCopy.closedLabel }}
              <template v-if="loc.hours_today">· {{ loc.hours_today }}</template>
            </div>

            <!-- Location name -->
            <div class="saya-display saya-italic text-4xl text-default leading-none">{{ loc.title }}</div>
            <p v-if="loc.city" class="mt-1.5 text-sm text-muted">{{ loc.city }}</p>

            <!-- Address -->
            <p class="mt-5 text-sm leading-relaxed text-muted">{{ formatAddress(loc.address) }}</p>

            <!-- CTA -->
            <div class="mt-6 border-t border-default pt-5">
              <span class="saya-eyebrow text-muted">{{ locationsCopy.visitLocationCta }}</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- Empty / placeholder state -->
      <div v-else>
        <div class="grid gap-8 md:grid-cols-2">
          <div v-for="loc in placeholders" :key="loc.title" class="overflow-hidden border border-dashed border-default">
            <div class="aspect-16/10 flex items-center justify-center bg-muted">
              <UIcon name="i-heroicons-map-pin" class="size-10 text-muted" />
            </div>
            <div class="p-8 pb-9">
              <p v-if="loc.city" class="saya-eyebrow mb-3 text-muted">{{ loc.city }}</p>
              <div class="saya-display saya-italic text-4xl text-muted leading-none">{{ loc.title }}</div>
              <p class="mt-5 text-sm leading-relaxed text-muted">{{ loc.address }}</p>
            </div>
          </div>
        </div>
        <div v-if="isAuthenticated" class="mt-12 text-center">
          <UButton
            to="/dashboard"
            color="primary"
            variant="solid"
            class="rounded-full"
          >
            {{ locationsCopy.connectGoogleLocationsCta }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

type AddressInput = string | { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string } | null | undefined

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { isAuthenticated } = useAuth()
const { locale } = useI18n()
const locationsCopy = computed(() => getVerticalCopy(unref(site)?.vertical, locale.value))

const { locations, pending } = useBootstrap()

function formatAddress(address: AddressInput) {
  if (!address) return ''
  if (typeof address === 'string') return address
  return [address.addressLines?.[0], address.locality, address.administrativeArea, address.postalCode].filter(Boolean).join(', ')
}

const placeholders = computed(() => [
  { title: locationsCopy.value.mainDiningRoomLabel, city: 'Krabi', address: locationsCopy.value.connectGoogleAddressNote },
  { title: locationsCopy.value.secondLocationLabel, city: 'Coming Soon', address: locationsCopy.value.additionalLocationsNote }
])

const siteName = computed(() => unref(site)?.brand_name || 'KrabiClaw')

useSeoMeta({
  title: () => `Locations · ${siteName.value}`,
  description: 'Find all our restaurant locations.',
  ogTitle: () => `Locations · ${siteName.value}`,
  ogDescription: 'Find all our restaurant locations.',
  ogSiteName: () => siteName.value,
  twitterTitle: () => `Locations · ${siteName.value}`,
  twitterDescription: 'Find all our restaurant locations.',
  ogImage: useSharedOgImage(),
  ogUrl: useSeoUrl('/locations')
})
</script>
