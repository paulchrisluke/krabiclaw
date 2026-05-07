<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <SayaHero
      :title="getField('hero.title', 'Locations')"
      :subtitle="getField('hero.subtitle', 'Visit us at any of our restaurants')"
      size="page"
    />

    <AppSection bg="white" padding="lg">
      <div v-if="pending" class="grid gap-8 md:grid-cols-2">
        <article
          v-for="i in 2"
          :key="`loading-location-${i}`"
          class="overflow-hidden rounded-3xl border border-(--ui-border) bg-(--ui-bg) shadow-sm"
        >
          <div class="aspect-[16/10] bg-(--ui-bg-elevated) animate-pulse" />
          <div class="p-6 md:p-8">
            <USkeleton class="mb-3 h-6 w-48" />
            <USkeleton class="mb-6 h-4 w-28" />
            <div class="space-y-3">
              <USkeleton class="h-3 w-full" />
              <USkeleton class="h-3 w-2/3" />
              <USkeleton class="h-3 w-32" />
            </div>
            <div class="mt-8 flex gap-3">
              <USkeleton class="h-10 flex-1 rounded-full" />
              <USkeleton class="h-10 flex-1 rounded-full" />
            </div>
          </div>
        </article>
      </div>

      <div v-else-if="locations.length > 0" class="grid gap-8 md:grid-cols-2">
        <article
          v-for="location in locations"
          :key="location.id"
          class="overflow-hidden rounded-3xl border border-(--ui-border) bg-(--ui-bg) shadow-sm"
        >
          <NuxtLink :to="`/locations/${location.slug}`" class="group block">
            <div class="aspect-[16/10] overflow-hidden bg-(--ui-bg-elevated)">
              <img
                v-if="location.image_url"
                :src="location.image_url"
                :alt="location.title"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              >
              <div v-else class="flex h-full w-full items-center justify-center">
                <UIcon name="i-heroicons-map-pin" class="size-10 text-(--ui-text-muted)" />
              </div>
            </div>
          </NuxtLink>

          <div class="p-6 md:p-8">
            <div class="mb-5 flex items-start justify-between gap-4">
              <div>
                <div v-if="location.is_primary" class="mb-3">
                  <UBadge color="neutral" variant="soft" size="sm">Primary Location</UBadge>
                </div>
                <h2 class="text-2xl font-bold tracking-tight text-(--ui-text)">
                  {{ location.title }}
                </h2>
                <p v-if="location.city" class="mt-1 text-sm font-medium uppercase tracking-widest text-(--ui-text-muted)">
                  {{ location.city }}
                </p>
              </div>

              <div v-if="location.rating" class="shrink-0 text-right">
                <div class="flex items-center justify-end gap-1 text-sm font-bold text-(--ui-text)">
                  <UIcon name="i-heroicons-star-solid" class="size-4 text-yellow-400" />
                  <span>{{ location.rating }}</span>
                </div>
                <p v-if="location.review_count" class="text-xs text-(--ui-text-muted)">
                  {{ location.review_count }} reviews
                </p>
              </div>
            </div>

            <div class="space-y-3 text-sm text-(--ui-text-muted)">
              <p v-if="formatAddress(location.address)" class="flex gap-3">
                <UIcon name="i-heroicons-map-pin" class="mt-0.5 size-5 shrink-0" />
                <span>{{ formatAddress(location.address) }}</span>
              </p>
              <p v-else class="flex gap-3">
                <UIcon name="i-heroicons-map-pin" class="mt-0.5 size-5 shrink-0" />
                <span class="space-y-2">
                  <span class="block h-3 w-56 rounded bg-(--ui-bg-elevated)" />
                  <span class="block h-3 w-36 rounded bg-(--ui-bg-elevated)" />
                </span>
              </p>
              <a v-if="location.phone" :href="`tel:${location.phone}`" class="flex gap-3 font-medium text-(--ui-text)">
                <UIcon name="i-heroicons-phone" class="mt-0.5 size-5 shrink-0" />
                <span>{{ location.phone }}</span>
              </a>
              <p v-else class="flex gap-3">
                <UIcon name="i-heroicons-phone" class="mt-0.5 size-5 shrink-0" />
                <span class="block h-3 w-32 rounded bg-(--ui-bg-elevated)" />
              </p>
            </div>

            <div class="mt-8 flex flex-col gap-3 sm:flex-row">
              <UButton
                :to="`/locations/${location.slug}`"
                color="neutral"
                variant="solid"
                class="flex-1 rounded-full !bg-black !text-white hover:!bg-zinc-800"
                block
              >
                View Location
              </UButton>
              <UButton
                v-if="location.maps_url"
                :to="location.maps_url"
                target="_blank"
                color="neutral"
                variant="outline"
                class="flex-1 rounded-full"
                block
              >
                Directions
              </UButton>
            </div>
          </div>
        </article>
      </div>

      <div v-else>
        <div class="grid gap-8 md:grid-cols-2">
          <article
            v-for="location in placeholderLocations"
            :key="location.title"
            class="overflow-hidden rounded-3xl border border-(--ui-border) bg-(--ui-bg) shadow-sm"
          >
            <div class="aspect-[16/10] bg-(--ui-bg-elevated)">
              <div class="flex h-full w-full items-center justify-center">
                <div class="flex size-16 items-center justify-center rounded-2xl bg-(--ui-bg) text-(--ui-text-muted) shadow-sm">
                  <UIcon name="i-heroicons-map-pin" class="size-8" />
                </div>
              </div>
            </div>
            <div class="p-6 md:p-8">
              <p class="mb-3 text-sm font-bold uppercase tracking-widest text-(--ui-text-muted)">
                {{ location.city }}
              </p>
              <h2 class="text-2xl font-bold tracking-tight text-(--ui-text)">
                {{ location.title }}
              </h2>
              <div class="mt-6 space-y-3 text-sm text-(--ui-text-muted)">
                <p class="flex gap-3">
                  <UIcon name="i-heroicons-map-pin" class="mt-0.5 size-5 shrink-0" />
                  <span>{{ location.address }}</span>
                </p>
                <p class="flex gap-3">
                  <UIcon name="i-heroicons-phone" class="mt-0.5 size-5 shrink-0" />
                  <span>{{ location.phone }}</span>
                </p>
              </div>
              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <span class="flex min-h-10 flex-1 items-center justify-center rounded-full bg-(--ui-bg-inverted) px-4 text-sm font-semibold text-(--ui-text-inverted) opacity-25">
                  View Location
                </span>
                <span class="flex min-h-10 flex-1 items-center justify-center rounded-full border border-(--ui-border) px-4 text-sm font-semibold text-(--ui-text-muted)">
                  Directions
                </span>
              </div>
            </div>
          </article>
        </div>
        <div v-if="isAuthenticated" class="pt-10 text-center">
          <UButton
            :to="`/dashboard/sites/${siteId}/launch`"
            color="neutral"
            variant="solid"
            class="rounded-full !bg-black !text-white hover:!bg-zinc-800"
          >
            Connect Google Business
          </UButton>
        </div>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })
import { usePageContent } from '~/composables/usePageContent'

const { siteId } = await useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })
const { getField } = usePageContent('locations')
const { isAuthenticated } = useAuth()

const { data, pending } = await useFetch(`/api/public/sites/${siteId}/locations`, {
  key: `public-locations-${siteId}`,
  default: () => ({ locations: [] })
})

const locations = computed(() => data.value?.locations || [])

function formatAddress(address) {
  if (!address) return ''

  const lines = Array.isArray(address.addressLines) ? address.addressLines : []
  return [
    ...lines,
    address.streetAddress,
    address.locality,
    address.region,
    address.administrativeArea,
    address.postalCode
  ].filter(Boolean).join(', ')
}

const placeholderLocations = [
  {
    title: 'Main Dining Room',
    city: 'Krabi',
    address: 'Connect Google Business to sync the verified address.',
    phone: 'Phone number syncs here.'
  },
  {
    title: 'Second Location',
    city: 'Coming Soon',
    address: 'Additional locations appear here when they are added.',
    phone: 'Contact details appear here.'
  }
]

useSeoMeta({
  title: 'Locations | Saya Kitchen',
  description: 'Visit our restaurant locations.',
  ogUrl: '/locations'
})
</script>
