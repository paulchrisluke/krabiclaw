<template>
  <div class="min-h-screen bg-(--ui-bg) text-(--ui-text)">
    <SayaHero
      v-if="location"
      :title="location.title"
      :subtitle="locationSubtitle"
      size="page"
      :image="location.image_url"
    />

    <AppSection v-if="pending" bg="white" padding="lg">
      <div class="mx-auto max-w-4xl">
        <USkeleton class="mb-8 h-8 w-48" />
        <USkeleton class="h-72 rounded-3xl" />
      </div>
    </AppSection>

    <AppSection v-else-if="location" bg="white" padding="lg">
      <div class="mb-10">
        <UButton
          to="/locations"
          color="neutral"
          variant="ghost"
          icon="i-heroicons-arrow-left"
          class="rounded-full"
        >
          All Locations
        </UButton>
      </div>

      <div class="grid gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-8">
          <div>
            <div v-if="location.is_primary" class="mb-4">
              <UBadge color="neutral" variant="soft">Primary Location</UBadge>
            </div>
            <h1 class="text-4xl font-black italic tracking-tight text-(--ui-text) md:text-6xl">
              {{ location.title }}
            </h1>
            <p v-if="location.city" class="mt-3 text-sm font-bold uppercase tracking-[0.25em] text-(--ui-text-muted)">
              {{ location.city }}
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="rounded-2xl border border-(--ui-border) bg-(--ui-bg-elevated) p-6">
              <p class="mb-2 text-xs font-bold uppercase tracking-widest text-(--ui-text-muted)">Address</p>
              <p v-if="formatAddress(location.address)" class="text-(--ui-text)">
                {{ formatAddress(location.address) }}
              </p>
              <div v-else class="space-y-2">
                <div class="h-3 w-full rounded bg-(--ui-bg-muted)" />
                <div class="h-3 w-2/3 rounded bg-(--ui-bg-muted)" />
              </div>
            </div>
            <div v-if="location.phone" class="rounded-2xl border border-(--ui-border) bg-(--ui-bg-elevated) p-6">
              <p class="mb-2 text-xs font-bold uppercase tracking-widest text-(--ui-text-muted)">Phone</p>
              <a :href="`tel:${location.phone}`" class="font-semibold text-(--ui-text)">
                {{ location.phone }}
              </a>
            </div>
            <div v-else class="rounded-2xl border border-(--ui-border) bg-(--ui-bg-elevated) p-6">
              <p class="mb-2 text-xs font-bold uppercase tracking-widest text-(--ui-text-muted)">Phone</p>
              <div class="h-3 w-32 rounded bg-(--ui-bg-muted)" />
            </div>
            <div v-if="location.rating" class="rounded-2xl border border-(--ui-border) bg-(--ui-bg-elevated) p-6">
              <p class="mb-2 text-xs font-bold uppercase tracking-widest text-(--ui-text-muted)">Rating</p>
              <div class="flex items-center gap-2 font-bold text-(--ui-text)">
                <UIcon name="i-heroicons-star-solid" class="size-5 text-yellow-400" />
                <span>{{ location.rating }}</span>
                <span v-if="location.review_count" class="text-sm font-medium text-(--ui-text-muted)">
                  {{ location.review_count }} reviews
                </span>
              </div>
            </div>
            <div v-if="location.website_url" class="rounded-2xl border border-(--ui-border) bg-(--ui-bg-elevated) p-6">
              <p class="mb-2 text-xs font-bold uppercase tracking-widest text-(--ui-text-muted)">Website</p>
              <a :href="location.website_url" target="_blank" rel="noopener noreferrer" class="font-semibold text-(--ui-text)">
                Visit Website
              </a>
            </div>
          </div>

          <div v-if="formattedHours.length > 0" class="rounded-3xl border border-(--ui-border) bg-(--ui-bg) p-6 md:p-8">
            <h2 class="mb-6 text-2xl font-bold text-(--ui-text)">Opening Hours</h2>
            <div class="divide-y divide-(--ui-border)">
              <div v-for="day in formattedHours" :key="`${day.day}-${day.hours}`" class="flex justify-between gap-6 py-3">
                <span class="font-medium text-(--ui-text)">{{ day.day }}</span>
                <span class="text-right text-(--ui-text-muted)">{{ day.hours }}</span>
              </div>
            </div>
          </div>
          <div v-else class="rounded-3xl border border-(--ui-border) bg-(--ui-bg) p-6 md:p-8">
            <h2 class="mb-6 text-2xl font-bold text-(--ui-text)">Opening Hours</h2>
            <div class="divide-y divide-(--ui-border)">
              <div v-for="day in placeholderHours" :key="day" class="flex justify-between gap-6 py-3">
                <span class="font-medium text-(--ui-text)">{{ day }}</span>
                <span class="w-28 rounded bg-(--ui-bg-elevated)" />
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-4">
          <div class="aspect-square overflow-hidden rounded-3xl bg-(--ui-bg-elevated)">
            <img
              v-if="location.image_url"
              :src="location.image_url"
              :alt="location.title"
              class="h-full w-full object-cover"
            >
            <div v-else class="flex h-full w-full items-center justify-center">
              <UIcon name="i-heroicons-map-pin" class="size-16 text-(--ui-text-muted)" />
            </div>
          </div>

          <UButton
            :to="`/locations/${location.slug}/menu`"
            color="neutral"
            variant="solid"
            class="rounded-full !bg-black !text-white hover:!bg-zinc-800"
            block
          >
            View Menu
          </UButton>
          <UButton
            v-if="location.maps_url"
            :to="location.maps_url"
            target="_blank"
            color="neutral"
            variant="outline"
            class="rounded-full"
            block
          >
            Get Directions
          </UButton>
        </aside>
      </div>
    </AppSection>

    <AppSection v-else bg="white" padding="lg">
      <div class="mx-auto max-w-xl py-16 text-center">
        <UIcon name="i-heroicons-map-pin" class="mx-auto mb-4 size-12 text-(--ui-text-muted)" />
        <h1 class="text-2xl font-bold text-(--ui-text)">Location Not Found</h1>
        <UButton to="/locations" color="neutral" variant="solid" class="mt-8 rounded-full !bg-black !text-white">
          View All Locations
        </UButton>
      </div>
    </AppSection>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'tenant' })

const route = useRoute()
const { siteId } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const { data, pending } = await useFetch(`/api/public/sites/${siteId}/locations/${slug.value}`, {
  key: `public-location-${siteId}-${slug.value}`,
  default: () => ({ location: null })
})

const location = computed(() => data.value?.location || null)
const formattedHours = computed(() => formatHours(location.value?.opening_hours))
const locationSubtitle = computed(() => formatAddress(location.value?.address))
const placeholderHours = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

function formatHours(hours) {
  if (!hours) return []
  if (!hours.periods) return []

  return hours.periods.map(period => ({
    day: period.openDay || 'Unknown',
    hours: `${period.openTime || 'N/A'} - ${period.closeTime || 'N/A'}`
  }))
}

useSeoMeta({
  title: () => location.value ? `${location.value.title} | Locations | Saya Kitchen` : 'Location Not Found | Saya Kitchen',
  description: () => location.value ? `Visit ${location.value.title}.` : 'Location not found.',
  ogUrl: () => location.value ? `/locations/${location.value.slug}` : '/locations'
})
</script>
