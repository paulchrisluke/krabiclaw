<template>
  <div class="min-h-screen bg-default text-default">


    <template v-if="location">
      <!-- Sub-nav (Level 2) -->
      <SayaSubNav 
        :location-slug="slug" 
        active="photos" 
      />

      <!-- Compact Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 lg:px-8 text-center">
        <NuxtLink :to="`/locations/${slug}`" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← Back to {{ location?.title }}
        </NuxtLink>
        
        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">Inside <em class="saya-italic">the room</em></h1>
          <p class="text-sm text-muted">
            {{ location?.title }}
          </p>
        </div>
      </header>


    <!-- Category filter tabs -->
    <SayaFilterTabs
      v-model="activeCategory"
      :tabs="cats"
    />

      <!-- Gallery -->
      <UPage class="mx-auto max-w-7xl px-4 pt-12 pb-24 sm:px-6 lg:px-8">
        <UPageBody>
          <!-- Empty -->
          <div v-if="sorted.length === 0" class="py-24 text-center">
            <div class="saya-display saya-italic text-3xl text-default">No photos yet.</div>
            <p class="mt-2 text-sm text-muted">Photos synced from Google Business will appear here.</p>
          </div>

          <!-- Masonry -->
          <div v-else class="saya-masonry">
            <button
              v-for="(photo, i) in sorted"
              :key="photo.id"
              class="group relative block w-full overflow-hidden rounded-2xl bg-black"
              @click="openLightbox(i)"
            >
              <UImage
                :src="photo.local_url || photo.google_url || photo.thumbnail_url"
                :alt="photo.description || ''"
                loading="lazy"
                class="block w-full transition-opacity duration-200 group-hover:opacity-80"
              />
              <!-- If the sticky tab/header div is needed, move it here, outside the <img> -->
              <!-- <div class="sticky top-0 z-40 border-b border-default bg-default"> ... </div> -->
              <div class="absolute inset-0 flex items-end bg-linear-to-t from-black/60 to-transparent p-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <span class="saya-eyebrow rounded-full bg-white/25 px-4 py-1.5 text-[10px] font-bold tracking-widest text-white backdrop-blur-md border border-white/20">
                  {{ photo.category || 'Gallery' }}
                </span>
              </div>
            </button>
          </div>
        </UPageBody>
      </UPage>

    <!-- Lightbox -->
    <SayaLightbox v-model:open="lightboxOpen" v-model:index="lightboxIdx" :items="lightboxItems" :title="location?.title" />
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.brand_name || 'KrabiClaw')

const { location, photosList } = useBootstrap()

const photos = photosList

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
      ? photos.value.filter((p: ApiValue) => p.category === 'FOOD' || p.category === 'MENU')
      : photos.value.filter((p: ApiValue) => p.category === activeCategory.value)
  return [...filtered].sort((a: ApiValue, b: ApiValue) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
})

// Lightbox
const lightboxOpen = ref(false)
const lightboxIdx = ref(0)

function openLightbox(i: number) {
  lightboxIdx.value = i
  lightboxOpen.value = true
}

const lightboxItems = computed(() =>
  sorted.value.map((p: ApiValue) => ({
    url: p.local_url || p.google_url || p.thumbnail_url,
    kind: 'image' as const,
    description: p.description,
    alt: p.description || p.category || ''
  }))
)


const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const currentPageUrl = useSeoUrl(() => `/locations/${slug.value}/photos`)
const ogImage = useSharedOgImage(() => photos.value[0]?.local_url || photos.value[0]?.google_url || photos.value[0]?.thumbnail_url)

function toAbsoluteUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value, siteUrl).toString()
  } catch {
    return null
  }
}

const seoTitle = () => `Photos · ${location.value?.title || slug.value}`
const seoDescription = () => `${photos.value.length} photos from ${location.value?.title || slug.value} at ${siteName.value}.`

useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
  ogSiteName: () => siteName.value,
  twitterTitle: seoTitle,
  twitterDescription: seoDescription,
  ogImage,
  ogUrl: currentPageUrl
})

useSchemaOrg([
  computed(() => ({
    '@type': 'ImageGallery',
    name: `${location.value?.title ?? ''} Photos`,
    image: photos.value.slice(0, 20).map((p: ApiValue) => {
      const contentUrl = toAbsoluteUrl(p.thumbnail_url || p.local_url || p.google_url)
      const thumbnailUrl = toAbsoluteUrl(p.thumbnail_url || p.local_url || p.google_url)
      if (!contentUrl) return null
      return {
        '@type': 'ImageObject',
        contentUrl,
        thumbnailUrl,
        description: p.description,
        about: p.category
      }
    }).filter(Boolean)
  })),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: `${siteUrl}/locations` },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${siteUrl}/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Photos', item: `${siteUrl}/locations/${slug.value}/photos` }
    ]
  }))
])
</script>
