<template>
  <NuxtLayout name="saya">
    <div class="min-h-screen bg-default text-default">
      <div v-if="pending" class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <USkeleton class="h-64 w-full" />
      </div>

      <!-- Single location: redirect handled server-side; this shows if redirect didn't fire -->
      <div v-else-if="locations.length === 1" class="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <NuxtLink :to="`/locations/${locations[0].slug}/photos`" class="saya-display-md saya-italic text-default no-underline hover:opacity-70">
          View photos →
        </NuxtLink>
      </div>

      <!-- Multi-location: link to each location's gallery -->
      <div v-else-if="locations.length > 1">
        <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8">
          <p class="saya-kicker mb-6">Gallery</p>
          <h1 class="saya-display-md saya-italic text-default">Photos from every room.</h1>
        </header>
        <div class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div class="grid gap-6 sm:grid-cols-2">
            <NuxtLink
              v-for="loc in locations"
              :key="loc.id"
              :to="`/locations/${loc.slug}/photos`"
              class="group block border border-default text-default no-underline transition hover:border-muted"
            >
              <div class="aspect-video overflow-hidden bg-muted">
                <video v-if="loc.public_url && loc.kind === 'video'" :src="loc.public_url" class="h-full w-full object-cover" autoplay muted loop playsinline />
                <img v-else-if="loc.public_url" :src="loc.public_url" :alt="loc.title" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div class="p-7">
                <p class="saya-eyebrow mb-3 text-muted">{{ loc.city || loc.neighborhood }}</p>
                <div class="saya-display saya-italic text-3xl text-default leading-none">{{ loc.title }}</div>
                <p class="mt-4 text-xs uppercase tracking-widest text-muted">View photos →</p>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- No locations yet -->
      <div v-else class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <h1 class="saya-display-md text-muted">No photos yet.</h1>
        <p class="mt-4 text-sm text-muted">Add a location and connect Google Business to sync photos.</p>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup>
definePageMeta({ layout: false })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { locations } = useBootstrap()
const pending = ref(false)
const restaurantName = computed(() => site?.brand_name || 'Our Restaurant')

if (locations.value.length === 1) {
  await navigateTo(`/locations/${locations.value[0].slug}/photos`, { replace: true, redirectCode: 301 })
}

const currentPageUrl = useSeoUrl('/photos')
useSeoMeta({
  title: computed(() => `Photos | ${restaurantName.value}`),
  description: computed(() => `Photo gallery from ${restaurantName.value}.`),
  ogTitle: computed(() => `Photos | ${restaurantName.value}`),
  ogDescription: computed(() => `Photo gallery from ${restaurantName.value}.`),
  ogSiteName: computed(() => restaurantName.value),
  twitterTitle: computed(() => `Photos | ${restaurantName.value}`),
  twitterDescription: computed(() => `Photo gallery from ${restaurantName.value}.`),
  ogImage: useTenantOgImage(),
  ogUrl: currentPageUrl
})
</script>
