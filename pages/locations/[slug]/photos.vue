<template>
  <div class="min-h-screen bg-default text-default">

    <nav class="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <UBreadcrumb :items="breadcrumb" />
    </nav>

    <header class="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8">
      <p class="saya-kicker mb-6">{{ location?.title }}</p>
      <h1 class="saya-display-lg text-default">
        Inside <em class="saya-italic">the room</em>
      </h1>
      <p class="mx-auto mt-5 text-sm text-muted">{{ photos.length }} photos · synced from Google Business and uploaded directly.</p>
    </header>

    <SayaSubNav :location-slug="slug" active="photos" :review-count="location?.review_count" :photo-count="photos.length" />

    <!-- Category filter tabs -->
    <div class="border-b border-default bg-default">
      <div class="mx-auto flex max-w-7xl gap-3 overflow-x-auto px-4 py-5 sm:px-6 lg:px-8">
        <button
          v-for="cat in cats"
          :key="cat.key"
          :class="[
            'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
            activeCategory === cat.key
              ? 'border-default bg-default text-inverted'
              : 'border-default text-default hover:border-muted'
          ]"
          @click="activeCategory = cat.key"
        >
          {{ cat.label }}
          <span
            :class="[
              'rounded-full px-2 py-0.5 text-xs tabular-nums',
              activeCategory === cat.key ? 'bg-white/20 text-white/90' : 'bg-muted text-muted'
            ]"
          >{{ counts[cat.key] ?? 0 }}</span>
        </button>
      </div>
    </div>

    <!-- Gallery -->
    <section class="mx-auto max-w-7xl px-4 py-12 pb-24 sm:px-6 lg:px-8">
      <!-- Skeleton -->
      <div v-if="pending" class="saya-masonry">
        <div
          v-for="i in 9"
          :key="i"
          class="overflow-hidden rounded-2xl bg-muted"
          :style="`height: ${120 + (i % 4) * 80}px; animation: sayaPulse 1.6s ease-in-out infinite`"
        />
      </div>

      <!-- Empty -->
      <div v-else-if="sorted.length === 0" class="py-24 text-center">
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
          <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span class="saya-eyebrow rounded-full bg-white/18 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
              {{ photo.category || '—' }}
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
            :src="sorted[lightboxIdx].local_url || sorted[lightboxIdx].google_url"
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
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')

const { data: locData } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}`,
  { key: () => `loc-photos-loc-${siteId}-${slug.value}`, default: () => ({ location: null }) }
)
const location = computed(() => (locData as any).value?.location ?? null)

const { data, pending } = await useFetch(
  () => `/api/public/sites/${siteId}/locations/${slug.value}/photos`,
  { key: () => `loc-photos-${siteId}-${slug.value}`, default: () => ({ photos: [] }) }
)
const photos = computed(() => (data as any).value?.photos ?? [])

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
  photos.value.forEach((p: any) => {
    if (p.category && typeof p.category === 'string' && p.category.trim()) {
      m[p.category] = (m[p.category] ?? 0) + 1
    }
  })
  return m
})

const sorted = computed(() => {
  const filtered = activeCategory.value === 'ALL' ? photos.value : photos.value.filter((p: any) => p.category === activeCategory.value)
  return [...filtered].sort((a: any, b: any) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
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

const breadcrumb = computed(() => [
  { label: siteName.value, to: '/' },
  { label: 'Locations', to: '/locations' },
  { label: location.value?.title || slug.value, to: `/locations/${slug.value}` },
  { label: 'Photos' }
])

useSeoMeta({
  title: () => `Photos · ${location.value?.title || slug.value}`,
  description: () => `${photos.value.length} photos from ${location.value?.title} at ${siteName.value}.`,
  ogUrl: () => `/locations/${slug.value}/photos`
})

useSchemaOrg([
  computed(() => ({
    '@type': 'ImageGallery',
    name: `${location.value?.title ?? ''} Photos`,
    image: photos.value.slice(0, 20).map((p: any) => ({
      '@type': 'ImageObject',
      contentUrl: p.local_url || p.google_url,
      thumbnailUrl: p.thumbnail_url,
      description: p.description,
      about: p.category
    }))
  })),
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: '/' },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: '/locations' },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Photos', item: `/locations/${slug.value}/photos` }
    ]
  }))
])
</script>
