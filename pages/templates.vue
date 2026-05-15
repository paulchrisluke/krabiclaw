<template>
  <div>
    <!-- ── Theme preview hero ──────────────────────────────────────────── -->
    <section class="relative bg-zinc-950 overflow-hidden" style="height: 520px">
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

      <!-- Action bar overlaid at bottom -->
      <div class="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-zinc-950/80 backdrop-blur-sm">
        <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div class="flex items-center gap-4">
            <div class="flex size-9 items-center justify-center rounded-lg bg-white text-zinc-950">
              <span class="text-sm font-bold">S</span>
            </div>
            <div>
              <p class="text-sm font-semibold text-white">Saya</p>
              <p class="text-xs text-white/50">by KrabiClaw · Included free</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <a
              :href="demoUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white no-underline transition hover:bg-white/10"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
              View demo
            </a>
            <NuxtLink
              to="/signup"
              class="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-950 no-underline transition hover:bg-zinc-100"
            >
              Get started free
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
            <div class="flex size-12 items-center justify-center rounded-xl bg-inverted text-inverted mb-4">
              <span class="text-lg font-bold">S</span>
            </div>
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
              <a
                :href="demoUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="flex w-full items-center justify-center gap-2 rounded-full border border-default px-5 py-3 text-sm font-medium text-default no-underline transition hover:bg-elevated"
              >
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
                View live demo
              </a>
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

// The live demo site — matches seeds/demo.sql subdomain
const demoUrl = computed(() =>
  import.meta.dev
    ? 'http://demo.localhost:3000'
    : `https://demo.${platformHostname}`
)

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
