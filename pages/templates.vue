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

    <!-- ── Page hero ─────────────────────────────────────────────────── -->
    <section class="relative overflow-hidden py-16 lg:py-20">
      <!-- Ambient gradient orbs -->
      <div class="pointer-events-none absolute inset-0 -z-10">
        <div class="absolute -top-20 right-1/4 w-[500px] h-[500px] rounded-full opacity-20 blur-3xl" style="background: radial-gradient(circle, var(--kc-coral-200) 0%, transparent 70%);"></div>
        <div class="absolute -bottom-10 left-1/3 w-[400px] h-[400px] rounded-full opacity-15 blur-3xl" style="background: radial-gradient(circle, var(--kc-teal-100) 0%, transparent 70%);"></div>
      </div>

      <div class="mx-auto max-w-6xl px-4 sm:px-6 text-center">
        <span class="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full border border-(--kc-teal)/20 mb-5">
          <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0" />
          Themes
        </span>
        <h1 class="text-[clamp(32px,5vw,56px)] font-extrabold tracking-tight leading-[1.05] mb-4 m-0">
          <span class="text-default">Beautiful templates,</span><br>
          <span style="background: linear-gradient(135deg, var(--kc-coral) 0%, var(--kc-teal) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">ready to launch.</span>
        </h1>
        <p class="text-lg text-muted max-w-xl mx-auto">
          Professional restaurant websites built for local businesses. Pick a theme, connect ChatGPT, go live.
        </p>
      </div>
    </section>

    <!-- ── Theme preview card ─────────────────────────────────────────────── -->
    <section class="mx-auto max-w-6xl px-4 py-4 sm:px-6">
      <div class="relative overflow-hidden rounded-2xl border border-default" style="background: var(--ui-bg-elevated);">
        <!-- Top gradient strip -->
        <div class="absolute top-0 inset-x-0 h-0.5" style="background: linear-gradient(90deg, var(--kc-coral) 0%, var(--kc-teal) 100%);"></div>
        <!-- Iframe preview of the live demo site -->
        <div class="relative aspect-[16/10] overflow-hidden bg-zinc-950">
          <iframe
            :src="demoUrl"
            class="absolute inset-0 w-full h-full border-0"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
            title="Saya theme live preview"
          />
        </div>

        <!-- Action bar -->
        <div class="border-t border-default px-6 py-4" style="background: var(--ui-bg-elevated);">
          <div class="flex items-center justify-between gap-4">
            <!-- Left: Theme name and Free stacked -->
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%);">
                S
              </div>
              <div>
                <p class="text-sm font-semibold text-default">Saya</p>
                <p class="text-xs text-muted">Free on all plans</p>
              </div>
            </div>

            <!-- Right: Open demo and Try buttons -->
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-default px-4 text-sm font-medium text-default no-underline transition hover:bg-elevated"
                @click="openDemoPreview"
              >
                <UIcon name="i-lucide-arrow-up-right" class="size-4" />
                Open demo
              </button>
              <NuxtLink
                to="/signup"
                class="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold text-white no-underline transition hover:opacity-90"
                style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 100%); box-shadow: 0 3px 12px rgba(251,116,97,0.3);"
              >
                Try free
                <UIcon name="i-lucide-arrow-right" class="size-4" />
              </NuxtLink>
            </div>
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
            and deep Google Business integration — designed for local businesses that want to look
            as good online as they do in person.
          </p>

          <!-- Feature screenshots grid -->
          <div class="mt-10 grid gap-4 sm:grid-cols-2">
            <div v-for="feature in featureScreenshots" :key="feature.label" class="group overflow-hidden rounded-xl border border-default bg-elevated hover:border-(--kc-coral)/30 hover:shadow-md transition-all duration-300">
              <div class="relative flex aspect-video items-center justify-center overflow-hidden" style="background: linear-gradient(135deg, var(--ui-bg-muted) 0%, var(--ui-bg-elevated) 100%);">
                <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style="background: linear-gradient(135deg, var(--kc-coral-50) 0%, var(--kc-teal-100)/30 100%);"></div>
                <div class="relative w-14 h-14 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%); box-shadow: 0 8px 24px rgba(31,37,71,0.2);">
                  <UIcon :name="feature.icon" class="size-6 text-white" />
                </div>
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
          <div class="rounded-2xl border border-default overflow-hidden" style="background: var(--ui-bg-elevated); box-shadow: 0 8px 40px rgba(31,37,71,0.08);">
            <!-- Gradient top strip -->
            <div class="h-1" style="background: linear-gradient(90deg, var(--kc-coral) 0%, var(--kc-teal) 100%);"></div>
            <div class="p-6">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white text-xl font-bold mb-4" style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%); box-shadow: 0 4px 12px rgba(31,37,71,0.2);">
                S
              </div>
              <h3 class="text-xl font-bold text-default">Saya</h3>
              <p class="mt-1 text-sm text-muted">Elegant &amp; Minimal Theme</p>

              <div class="mt-4 rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
                <p class="text-sm font-semibold text-primary">Free on all plans</p>
                <p class="mt-0.5 text-xs text-muted">No purchase needed — start building immediately</p>
              </div>

              <div class="mt-6 space-y-3">
                <NuxtLink
                  to="/signup"
                  class="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white no-underline transition hover:opacity-90"
                  style="background: linear-gradient(135deg, var(--kc-coral) 0%, #e0524c 100%); box-shadow: 0 4px 16px rgba(251,116,97,0.2);"
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
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

const config = useRuntimeConfig()
const platformHostname = config.public.freeSiteDomain?.replace(/^https?:\/\//, '') || 'krabiclaw.com'
const isDemoPreviewOpen = ref(false)

// The live demo site — matches the ephemeral demo seed subdomain
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
    description: 'Hours, map embed, address, offerings preview, reviews, photos, and Q&A — all under one location URL.'
  },
  {
    icon: 'i-heroicons-star',
    label: 'Reviews & ratings',
    description: 'Star distribution histogram, owner replies, and a filterable review feed.'
  },
  {
    icon: 'i-heroicons-list-bullet',
    label: 'Full offerings',
    description: 'Sections, item photos, prices, details, and availability — all editable from the dashboard.'
  },
  {
    icon: 'i-heroicons-sparkles',
    label: 'ChatGPT Plugin',
    description: 'Update content, generate descriptions, publish posts, and manage your site by chatting directly in ChatGPT.'
  }
]

const included = [
  'Homepage with hero, location grid, and review highlights',
  'Location sub-pages: offerings, reviews, photos, Q&A, contact',
  'Google Business data sync (Pro plan)',
  'ChatGPT Plugin for content management',
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
const sharedOgImage = useSharedOgImage()
const currentPageUrl = useSeoUrl('/templates')

useBreadcrumbSchema([
  { name: 'Home', url: `https://${platformHostname}/` },
  { name: 'Templates', url: `https://${platformHostname}/templates` }
])

useSeoMeta({
  title: 'Saya Theme | KrabiClaw',
  description: 'The Saya theme — editorial design, Google Business integration, AI content management. Free on all plans.',
  ogImage: sharedOgImage,
  ogUrl: currentPageUrl,
  ogType: 'website'
})
</script>
