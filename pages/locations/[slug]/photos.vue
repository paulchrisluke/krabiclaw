<template>
  <div class="min-h-screen bg-default text-default">

    <!-- Loading -->
    <template v-if="pending">
      <div class="saya-masonry mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div
          v-for="i in 9"
          :key="i"
          class="overflow-hidden rounded-2xl bg-muted"
          :style="`height: ${120 + (i % 4) * 80}px; animation: sayaPulse 1.6s ease-in-out infinite`"
        />
      </div>
    </template>

    <template v-else-if="location">
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
    <div class="sticky top-0 z-40 border-b border-default bg-default">
      <div class="mx-auto flex h-11 max-w-7xl items-center gap-6 overflow-x-auto px-4 sm:px-6 lg:px-8">
        <button
          v-for="cat in cats"
          :key="cat.key"
          :class="[
            'relative flex h-full shrink-0 items-center text-[10px] font-bold uppercase tracking-widest transition-colors',
            activeCategory === cat.key
              ? 'text-default'
              : 'text-muted hover:text-default'
          ]"
          @click="activeCategory = cat.key"
        >
          {{ cat.label }}

          <!-- Active indicator -->
          <div 
            v-if="activeCategory === cat.key"
            class="absolute bottom-0 left-0 h-0.5 w-full bg-primary"
          />
        </button>
      </div>
    </div>

      <!-- Gallery -->
      <section class="mx-auto max-w-7xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
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
          <img
            :src="photo.thumbnail_url || photo.local_url || photo.google_url"
            :alt="photo.description || ''"
            class="block w-full transition-opacity duration-200 group-hover:opacity-80"
            loading="lazy"
          >
          <div class="absolute inset-0 flex items-end bg-linear-to-t from-black/60 to-transparent p-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span class="saya-eyebrow rounded-full bg-white/25 px-4 py-1.5 text-[10px] font-bold tracking-widest text-white backdrop-blur-md border border-white/20">
              {{ photo.category || 'Gallery' }}
            </span>
          </div>
        </button>
      </div>
    </section>

    <!-- Lightbox -->
    <UModal v-model:open="lightboxOpen" fullscreen :ui="{ content: 'bg-black/92 flex items-center justify-center' }">
      <template #content>
        <div class="relative flex h-full w-full items-center justify-center p-16">
          <!-- Close -->
          <button
            class="absolute right-6 top-6 flex size-11 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/25"
            aria-label="Close"
            @click="lightboxOpen = false"
          >
            <UIcon name="i-heroicons-x-mark" class="size-5" />
          </button>

          <!-- Prev -->
          <button
            v-if="lightboxIdx > 0"
            class="absolute left-6 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/25"
            aria-label="Previous"
            @click="lightboxIdx--"
          >
            <UIcon name="i-heroicons-chevron-left" class="size-5" />
          </button>

          <!-- Next -->
          <button
            v-if="lightboxIdx < sorted.length - 1"
            class="absolute right-6 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/25"
            aria-label="Next"
            @click="lightboxIdx++"
          >
            <UIcon name="i-heroicons-chevron-right" class="size-5" />
          </button>

          <!-- Image -->
          <img
            v-if="sorted[lightboxIdx]"
            :src="sorted[lightboxIdx].thumbnail_url || sorted[lightboxIdx].local_url || sorted[lightboxIdx].google_url"
            alt=""
            class="max-h-[85vh] max-w-[90vw] object-contain"
            @click.stop
          >

          <!-- Caption -->
          <div
            v-if="sorted[lightboxIdx]?.description"
            class="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-xl rounded-xl bg-black/40 px-5 py-3 text-center text-sm leading-relaxed text-white backdrop-blur-sm"
          >
            {{ sorted[lightboxIdx].description }}
          </div>

          <!-- Counter -->
          <div class="absolute left-6 top-6 tabular-nums text-sm text-white/70">
            {{ lightboxIdx + 1 }} / {{ sorted.length }}
          </div>
        </div>
      </template>
      </UModal>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.value?.name || (site as ApiValue)?.name || 'Saya')

const { data: locData } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `loc-photos-loc-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (locData as ApiValue).value?.location ?? null)

const { data, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}/photos`,
  { key: () => `loc-photos-${siteId}-${slug.value}`, default: () => ({ photos: [] }) }
)
const photos = computed(() => (data as ApiValue).value?.photos ?? [])

const cats = [
  { key: 'ALL', label: 'All' },
  { key: 'FOOD', label: 'Food' },
  { key: 'INTERIOR', label: 'Interior' },
  { key: 'EXTERIOR', label: 'Exterior' },
  { key: 'MENU', label: 'Menu' },
  { key: 'TEAM', label: 'Team' }
]
const activeCategory = ref('ALL')

const counts = computed(() => {
  const m: Record<string, number> = { ALL: photos.value.length }
  photos.value.forEach((p: ApiValue) => {
    if (p.category && typeof p.category === 'string') {
      const trimmed = p.category.trim()
      if (!trimmed) return
      m[trimmed] = (m[trimmed] ?? 0) + 1
    }
  })
  return m
})

const sorted = computed(() => {
  const filtered = activeCategory.value === 'ALL' ? photos.value : photos.value.filter((p: ApiValue) => p.category === activeCategory.value)
  return [...filtered].sort((a: ApiValue, b: ApiValue) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
})

// Lightbox
const lightboxOpen = ref(false)
const lightboxIdx = ref(0)

function openLightbox(i: number) {
  lightboxIdx.value = i
  lightboxOpen.value = true
}

// Keyboard navigation
function onKeydown(e: KeyboardEvent) {
  if (!lightboxOpen.value) return
  if (e.key === 'Escape') lightboxOpen.value = false
  if (e.key === 'ArrowRight' && lightboxIdx.value < sorted.value.length - 1) lightboxIdx.value++
  if (e.key === 'ArrowLeft' && lightboxIdx.value > 0) lightboxIdx.value--
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))


const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

function toAbsoluteUrl(value?: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value, siteUrl).toString()
  } catch {
    return null
  }
}

useSeoMeta({
  title: () => `Photos · ${location.value?.title || slug.value}`,
  description: () => `${photos.value.length} photos from ${location.value?.title} at ${siteName.value}.`,
  ogUrl: () => `${siteUrl}/locations/${slug.value}/photos`
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
