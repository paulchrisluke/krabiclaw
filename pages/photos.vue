<template>
  <div class="min-h-screen bg-default text-default">
    <div v-if="pending" class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div class="h-64 w-full animate-pulse rounded bg-elevated" />
    </div>

    <template v-else>
      <!-- Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-16 pb-12 sm:px-6 lg:px-8 text-center">
        <p class="saya-kicker mb-6">Gallery</p>
        <h1 class="saya-display-md saya-italic text-default">Photos from every room.</h1>

        <!-- Multi-location pills -->
        <div v-if="locations.length > 1" class="mt-8 flex flex-wrap justify-center gap-3">
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}/photos`"
            class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
          >
            <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
            {{ loc.title }}
          </NuxtLink>
        </div>
      </header>

      <!-- Empty state -->
      <div v-if="photos.length === 0" class="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
        <h1 class="saya-display-md text-muted">No photos yet.</h1>
        <p class="mt-4 text-sm text-muted">Add a location and connect Google Business to sync photos.</p>
      </div>

      <template v-else>
        <!-- Category filter tabs -->
        <SayaFilterTabs v-model="activeCategory" :tabs="cats" />

        <!-- Gallery -->
        <div class="mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 lg:px-8">
          <div class="saya-masonry">
            <button
              v-for="(photo, i) in sorted"
              :key="photo.id"
              class="group relative block w-full overflow-hidden rounded-2xl bg-black"
              @click="openLightbox(i)"
            >
              <img
                :src="photo.local_url || photo.google_url || photo.thumbnail_url"
                :alt="photo.description || ''"
                loading="lazy"
                class="block w-full transition-opacity duration-200 group-hover:opacity-80"
              />
              <div class="absolute inset-0 flex items-end bg-linear-to-t from-black/60 to-transparent p-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span class="saya-eyebrow rounded-full bg-white/25 px-4 py-1.5 text-[10px] font-bold tracking-widest text-white backdrop-blur-md border border-white/20">
                  {{ locationTitle(photo) || photo.category || 'Gallery' }}
                </span>
              </div>
            </button>
          </div>
        </div>

        <!-- Lightbox -->
        <SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIdx" :items="lightboxItems" :title="siteName" />
      </template>
    </template>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const { locations, photosList, pending } = useBootstrap()
const photos = photosList
const siteName = computed(() => site?.brand_name || 'Our Site')

const locationsById = computed(() => Object.fromEntries(locations.value.map(l => [l.id, l])))
function locationTitle(photo) {
  return locations.value.length > 1 ? locationsById.value[photo.location_id]?.title : null
}

const cats = [
  { key: 'ALL', label: 'All' },
  { key: 'FOOD', label: 'Food' },
  { key: 'INTERIOR', label: 'Interior' },
  { key: 'EXTERIOR', label: 'Exterior' },
  { key: 'MENU', label: 'Menu' },
  { key: 'TEAM', label: 'Team' }
]
const activeCategory = ref('ALL')

const sorted = computed(() => {
  const filtered = activeCategory.value === 'ALL'
    ? photos.value
    : activeCategory.value === 'FOOD'
      ? photos.value.filter(p => p.category === 'FOOD' || p.category === 'MENU')
      : photos.value.filter(p => p.category === activeCategory.value)
  return [...filtered].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
})

const lightboxOpen = ref(false)
const lightboxIdx = ref(0)
function openLightbox(i) {
  lightboxIdx.value = i
  lightboxOpen.value = true
}

const lightboxItems = computed(() =>
  sorted.value.map(p => ({
    url: p.local_url || p.google_url || p.thumbnail_url,
    kind: 'image',
    description: p.description,
    alt: p.description || p.category || ''
  }))
)

const currentPageUrl = useSeoUrl('/photos')
useSeoMeta({
  title: computed(() => `Photos | ${siteName.value}`),
  description: computed(() => `Photo gallery from ${siteName.value}.`),
  ogTitle: computed(() => `Photos | ${siteName.value}`),
  ogDescription: computed(() => `Photo gallery from ${siteName.value}.`),
  ogSiteName: computed(() => siteName.value),
  twitterTitle: computed(() => `Photos | ${siteName.value}`),
  twitterDescription: computed(() => `Photo gallery from ${siteName.value}.`),
  ogImage: useTenantOgImage(),
  ogUrl: currentPageUrl
})
</script>
