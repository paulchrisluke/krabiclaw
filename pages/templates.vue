<template>
  <div>
    <Teleport to="body">
      <div
        v-if="isDemoPreviewOpen"
        class="fixed inset-0 z-[100] bg-zinc-950"
        role="dialog"
        aria-modal="true"
        aria-label="Saya theme demo preview"
      >
        <div class="fixed inset-x-0 top-0 z-[101] border-b border-white/10 bg-zinc-950/95 backdrop-blur-md">
          <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              class="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 text-white transition hover:bg-white/10"
              aria-label="Close demo preview"
              @click="closeDemoPreview"
            >
              <UIcon name="i-heroicons-x-mark" class="size-5" />
            </button>
            <div class="flex min-w-0 items-center gap-3">
              <SayaLogoMark />
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white">Saya</p>
                <p class="truncate text-xs text-white/50">by KrabiClaw · Included free</p>
              </div>
            </div>
            <div class="ml-auto">
              <NuxtLink
                to="/signup"
                class="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-semibold text-zinc-950 no-underline transition hover:bg-zinc-100 sm:px-5 sm:text-sm"
              >
                <span class="sm:hidden">Start free</span>
                <span class="hidden sm:inline">Get started free</span>
                <UIcon name="i-heroicons-arrow-right" class="size-4" />
              </NuxtLink>
            </div>
          </div>
        </div>
        <iframe
          :src="demoUrl"
          class="absolute inset-x-0 top-[113px] h-[calc(100dvh-113px)] w-full border-0 sm:top-[65px] sm:h-[calc(100dvh-65px)]"
          title="Saya theme live demo"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </Teleport>

    <!-- ── Theme preview hero ──────────────────────────────────────────── -->
    <section class="relative min-h-[560px] overflow-hidden bg-zinc-950 sm:min-h-[520px]">
      <!-- Iframe preview of the live demo site -->
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <iframe
          :src="demoUrl"
          class="w-full border-0 origin-top-left"
          style="height: 900px; transform: scale(0.578); transform-origin: top left; width: 172.8%;"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          title="Saya theme live preview"
        />
        <div class="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-zinc-950" />
      </div>
      <button
        type="button"
        class="absolute inset-x-0 top-0 bottom-[137px] z-10 cursor-pointer sm:bottom-[79px]"
        aria-label="Open Saya demo preview"
        @click="openDemoPreview"
      />

      <!-- Action bar overlaid at bottom -->
      <div class="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-zinc-950/85 backdrop-blur-sm">
        <div class="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
          <div class="flex min-w-0 items-center gap-3 sm:gap-4">
            <SayaLogoMark />
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white">Saya</p>
              <p class="truncate text-xs text-white/50">by KrabiClaw · Included free</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/20 px-4 text-[13px] font-medium text-white no-underline transition hover:bg-white/10 sm:px-5 sm:text-sm"
              @click="openDemoPreview"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
              View demo
            </button>
            <NuxtLink
              to="/signup"
              class="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-semibold text-zinc-950 no-underline transition hover:bg-zinc-100 sm:px-5 sm:text-sm"
            >
              <span class="sm:hidden">Start free</span>
              <span class="hidden sm:inline">Get started free</span>
              <UIcon name="i-heroicons-arrow-right" class="size-4" />
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Theme detail ────────────────────────────────────────────────── -->
    <div class="mx-auto max-w-6xl px-6 py-16 lg:py-20">
      <div class="grid gap-16 lg:grid-cols-[1fr_360px]">

        <!-- Left: description + features -->
        <div>
          <div class="mb-2 flex items-center gap-3">
            <h1 class="text-3xl font-bold text-default">Saya</h1>
            <span class="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-medium text-primary">Included free</span>
          </div>
          <p class="mt-3 text-lg leading-relaxed text-muted">
            The flagship KrabiClaw theme. Editorial typography, location-centric navigation,
            and deep Google Business integration — designed for restaurants that want to look
            as good online as they do in person.
          </p>

          <!-- Feature screenshots grid -->
          <div class="mt-10 grid gap-4 sm:grid-cols-2">
            <div v-for="feature in featureScreenshots" :key="feature.label" class="overflow-hidden rounded-xl border border-default bg-elevated">
              <div class="flex aspect-video items-center justify-center bg-muted">
                <UIcon :name="feature.icon" class="size-10 text-muted" />
              </div>
              <div class="p-4">
                <p class="text-sm font-semibold text-default">{{ feature.label }}</p>
                <p class="mt-1 text-xs leading-relaxed text-muted">{{ feature.description }}</p>
              </div>
            </div>
          </div>

          <!-- What's included -->
          <div class="mt-12">
            <h2 class="text-xl font-semibold text-default mb-6">What's included</h2>
            <div class="grid gap-3 sm:grid-cols-2">
              <div v-for="item in included" :key="item" class="flex items-start gap-3">
                <UIcon name="i-heroicons-check" class="mt-0.5 size-4 shrink-0 text-primary" />
                <span class="text-sm text-default">{{ item }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right: sticky sidebar -->
        <div class="lg:sticky lg:top-8 lg:self-start">
          <div class="rounded-2xl border border-default bg-elevated p-6">
            <SayaLogoMark
              container-class="mb-4 size-12 rounded-lg text-inverted"
              fallback-class="flex h-full w-full items-center justify-center rounded-xl bg-inverted text-lg font-bold"
            />
            <h3 class="text-xl font-bold text-default">Saya</h3>
            <p class="mt-1 text-sm text-muted">Elegant &amp; Minimal Restaurant Theme</p>

            <div class="mt-4 rounded-lg bg-primary/5 border border-primary/10 px-4 py-3">
              <p class="text-sm font-semibold text-primary">Free on all plans</p>
              <p class="mt-0.5 text-xs text-muted">No purchase needed — start building immediately</p>
            </div>

            <div class="mt-6 space-y-3">
              <NuxtLink
                to="/signup"
                class="flex w-full items-center justify-center gap-2 rounded-full bg-inverted px-5 py-3 text-sm font-semibold text-inverted no-underline transition hover:opacity-90"
              >
                Get started free
                <UIcon name="i-heroicons-arrow-right" class="size-4" />
              </NuxtLink>
              <button
                type="button"
                class="flex w-full items-center justify-center gap-2 rounded-full border border-default px-5 py-3 text-sm font-medium text-default no-underline transition hover:bg-elevated"
                @click="openDemoPreview"
              >
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
                View live demo
              </button>
            </div>

            <div class="mt-6 border-t border-default pt-6 space-y-2">
              <div v-for="spec in specs" :key="spec.label" class="flex justify-between text-sm">
                <span class="text-muted">{{ spec.label }}</span>
                <span class="font-medium text-default">{{ spec.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

const config = useRuntimeConfig()
const platformHostname = config.public.freeSiteDomain?.replace(/^https?:\/\//, '') || 'krabiclaw.com'
const isDemoPreviewOpen = ref(false)

// The live demo site — matches seeds/demo.sql subdomain
const demoUrl = computed(() =>
  import.meta.dev
    ? 'http://demo.localhost:3000'
    : `https://demo.${platformHostname}`
)

function openDemoPreview() {
  isDemoPreviewOpen.value = true
}

function closeDemoPreview() {
  isDemoPreviewOpen.value = false
}

function handlePreviewKeydown(event) {
  if (event.key === 'Escape') closeDemoPreview()
}

watch(isDemoPreviewOpen, (isOpen) => {
  if (!import.meta.client) return
  document.documentElement.classList.toggle('overflow-hidden', isOpen)
})

onMounted(() => {
  window.addEventListener('keydown', handlePreviewKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handlePreviewKeydown)
  if (import.meta.client) document.documentElement.classList.remove('overflow-hidden')
})

const featureScreenshots = [
  {
    icon: 'i-heroicons-map-pin',
    label: 'Location pages',
    description: 'Hours, map embed, address, menu preview, reviews, photos, and Q&A — all under one location URL.'
  },
  {
    icon: 'i-heroicons-star',
    label: 'Reviews & ratings',
    description: 'Star distribution histogram, owner replies, and a filterable review feed.'
  },
  {
    icon: 'i-heroicons-list-bullet',
    label: 'Full menu',
    description: 'Sections, item photos, prices, dietary flags, and availability — all editable from the dashboard.'
  },
  {
    icon: 'i-heroicons-sparkles',
    label: 'ChowBot AI',
    description: 'Update content, generate descriptions, publish posts, and manage your site by chatting.'
  }
]

const included = [
  'Homepage with hero, location grid, and review highlights',
  'Location sub-pages: menu, reviews, photos, Q&A, contact',
  'Google Business data sync (Pro plan)',
  'ChowBot AI content management',
  'Reservation form',
  'Brand story / about page',
  'SEO-optimised with schema markup',
  'Mobile-first responsive layout',
  'Dark mode support',
  'Multi-location support (Pro plan)',
  'Custom domain (Pro plan)',
  'Starter AI credits on signup'
]

const specs = [
  { label: 'Price', value: 'Free' },
  { label: 'Locations', value: '1 free / unlimited Pro' },
  { label: 'Mobile', value: 'Fully responsive' },
  { label: 'Languages', value: 'EN / TH' }
]

useBreadcrumbSchema([
  { name: 'Home', url: `https://${platformHostname}/` },
  { name: 'Templates', url: `https://${platformHostname}/templates` }
])

useSeoMeta({
  title: 'Saya Theme | KrabiClaw',
  description: 'The Saya restaurant theme — editorial design, Google Business integration, AI content management. Free on all plans.',
  ogImage: '/og-image.jpg',
  ogUrl: `https://${platformHostname}/templates`,
  ogType: 'website'
})
</script>
