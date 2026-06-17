<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <!-- ─── Top bar ──────────────────────────────────────────────────────── -->
    <header class="flex h-[60px] shrink-0 items-center gap-4 border-b border-default bg-default px-5">

      <!-- Brand mark -->
      <div class="flex items-center gap-2.5">
        <div
          class="flex size-[30px] select-none items-center justify-center rounded-lg bg-primary font-bold italic text-white"
          style="font-family: 'Fredoka', sans-serif; font-size: 16px;"
        >
          K
        </div>
      </div>

      <div class="h-[22px] w-px bg-default-200 dark:bg-default-700" />

      <!-- Site info -->
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-[13px] font-semibold text-highlighted">{{ siteName }}</span>
        <span class="truncate font-mono text-[10.5px] text-dimmed">
          {{ siteData?.status === 'active' ? `${siteDomain} · live` : 'setup · not public yet' }}
        </span>
      </div>

      <!-- ─── Readiness progress (centred) ──────────────────────────── -->
      <div class="flex flex-1 items-center justify-center">
        <div class="relative">
          <button
            :class="[
              'inline-flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-highlighted transition-colors',
              progOpen
                ? 'border-default bg-elevated'
                : 'border-default/60 bg-transparent hover:border-default hover:bg-elevated',
            ]"
            @click="progOpen = !progOpen"
          >
            <!-- Score ring -->
            <OnboardingScoreRing :score="readinessScore" :size="32" />
            <span class="flex flex-col text-left leading-tight">
              <b class="text-[12.5px] font-bold">{{ scoreHeadline }}</b>
              <span class="text-[10.5px] text-muted">
                {{ readinessDoneCount }} of {{ READINESS_CATEGORIES.length }} areas ready · score {{ Math.round(readinessScore) }}
              </span>
            </span>
            <UIcon
              name="i-heroicons-chevron-down-20-solid"
              class="size-3.5 text-dimmed transition-transform"
              :class="{ 'rotate-180': progOpen }"
            />
          </button>

          <!-- Readiness dropdown -->
          <Transition
            enter-active-class="transition-all duration-200 origin-top"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition-all duration-150 origin-top"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
          >
            <div
              v-if="progOpen"
              class="absolute left-1/2 top-[calc(100%+9px)] z-50 w-80 -translate-x-1/2 rounded-2xl border border-default bg-elevated p-3 shadow-xl"
            >
              <p class="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-dimmed">Launch readiness</p>
              <div class="flex flex-col gap-1.5">
                <div
                  v-for="cat in READINESS_CATEGORIES"
                  :key="cat.key"
                  class="flex items-center gap-2.5 rounded-[10px] border border-default bg-default px-3 py-2.5"
                >
                  <span
                    :class="[
                      'flex size-5 shrink-0 items-center justify-center rounded-md',
                      readiness[cat.key] === 'complete' ? 'bg-success-100 text-success-600 dark:bg-success-900/40 dark:text-success-400'
                      : readiness[cat.key] === 'attention' ? 'bg-warning-100 text-warning-600 dark:bg-warning-900/40 dark:text-warning-400'
                      : 'bg-muted text-dimmed',
                    ]"
                  >
                    <UIcon
                      :name="readiness[cat.key] === 'complete' ? 'i-heroicons-check' : cat.icon"
                      class="size-3"
                    />
                  </span>
                  <span class="min-w-0 flex-1">
                    <b class="block text-[12.5px] font-semibold text-highlighted">{{ cat.label }}</b>
                    <span class="text-[11px] text-muted">{{ cat.hint }}</span>
                  </span>
                  <span
                    :class="[
                      'text-[10px] font-bold uppercase tracking-wide',
                      readiness[cat.key] === 'complete' ? 'text-success-600 dark:text-success-400'
                      : readiness[cat.key] === 'attention' ? 'text-warning-600 dark:text-warning-400'
                      : 'text-dimmed',
                    ]"
                  >
                    {{ READINESS_STATE_LABEL[readiness[cat.key] ?? 'missing'] }}
                  </span>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Scrim to close dropdown -->
          <div v-if="progOpen" class="fixed inset-0 z-40" @click="progOpen = false" />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <UColorModeButton variant="ghost" color="neutral" size="sm" />
        <UButton color="neutral" variant="ghost" size="sm" @click="handleSaveLater">Save for later</UButton>
        <UButton color="neutral" variant="outline" size="sm" @click="handleExit">Exit</UButton>
      </div>
    </header>

    <!-- ─── Body ─────────────────────────────────────────────────────────── -->
    <div
      v-if="contextLoaded"
      class="grid min-h-0 flex-1 overflow-hidden"
      style="grid-template-columns: minmax(24rem, 45%) 1fr"
    >
      <OnboardingAgentPanel
        :site-id="siteId"
        :setup-mode="!siteId"
      />
      <OnboardingPreviewPane
        :iframe-src="iframeSrc"
        :site-locations="siteLocations"
        :selected-location-id="selectedLocationId"
        :selected-page="selectedPreviewPage"
        :site-status="computedSiteStatus"
        :site-domain="siteDomain"
        @select-page="onSelectPage"
        @select-location="onSelectLocation"
      />
    </div>

    <!-- Loading state -->
    <div v-else class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex items-center gap-3 text-muted">
        <UIcon name="i-heroicons-arrow-path" class="size-5 animate-spin" />
        <span class="text-sm">Loading workspace…</span>
      </div>
    </div>

    <AppToast />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'editor', ssr: false })

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const toast = useToast()

// ─── Readiness config ─────────────────────────────────────────────────────────
const READINESS_CATEGORIES = [
  { key: 'brand',   label: 'Brand clarity',         icon: 'i-heroicons-sparkles',       hint: 'Name, hero line, story voice' },
  { key: 'hero',    label: 'Hero media quality',    icon: 'i-heroicons-camera',          hint: 'A sharp, on-brand hero image' },
  { key: 'details', label: 'Core business details', icon: 'i-heroicons-map-pin',         hint: 'Address, hours, contact' },
  { key: 'offer',   label: 'Offer completeness',    icon: 'i-heroicons-document-text',   hint: 'Menu / experiences populated' },
  { key: 'trust',   label: 'Trust signals',         icon: 'i-heroicons-star',            hint: 'Reviews, ratings on display' },
  { key: 'launch',  label: 'Launch setup',          icon: 'i-heroicons-rocket-launch',   hint: 'Address chosen, ready to go live' },
] as const

type ReadinessKey = typeof READINESS_CATEGORIES[number]['key']
type ReadinessState = 'complete' | 'attention' | 'missing'

const READINESS_STATE_LABEL: Record<ReadinessState, string> = {
  complete: 'Complete',
  attention: 'Needs attention',
  missing: 'Missing',
}

// ─── State ────────────────────────────────────────────────────────────────────
const dashboard = useDashboardRestaurant()
const siteData = ref<ApiRecord | null>(null)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const previewToken = ref('')
const contextLoaded = ref(false)
const progOpen = ref(false)

const readiness = ref<Record<ReadinessKey, ReadinessState>>({
  brand: 'missing', hero: 'missing', details: 'missing',
  offer: 'missing', trust: 'missing', launch: 'missing',
})

// Preview selections
const selectedLocationId = ref<string | null>(null)
const selectedPreviewPage = ref('home')
const previewReloadToken = ref(0)

// ─── Computed ─────────────────────────────────────────────────────────────────
// Use dashboard state as siteId source — same as useChowBot internally uses
const siteId = computed<string | null>(() => dashboard.siteId.value)

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain as string
  return domain.replace(/^https?:\/\//, '')
})

const siteName = computed(() => siteData.value?.brand_name || 'New Site')
const siteDomain = computed(() =>
  siteData.value?.subdomain ? `${siteData.value.subdomain}.${platformHostname.value}` : ''
)

const sitePreviewBaseUrl = computed(() => {
  if (!siteData.value?.id) return ''
  const platformBase = ((config.public.platformDomain || config.public.freeSiteDomain) as string).replace(/\/$/, '')
  return `${platformBase}/preview/site/${siteData.value.id}`
})

const selectedLocation = computed(() =>
  siteLocations.value.find(l => l.id === selectedLocationId.value) ?? null
)

const locationScopedPages = new Set(['location', 'menu'])
const currentPageIsLocationScoped = computed(() => locationScopedPages.has(selectedPreviewPage.value))

const previewPagePath = computed(() => {
  if (!selectedLocation.value) return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
  if (selectedPreviewPage.value === 'location') return `/locations/${selectedLocation.value.slug}`
  if (selectedPreviewPage.value === 'menu') return `/locations/${selectedLocation.value.slug}/menu`
  return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
})

const iframeSrc = computed(() => {
  if (!sitePreviewBaseUrl.value) return ''
  if (currentPageIsLocationScoped.value && !selectedLocation.value) return ''
  const subPath = previewPagePath.value === '/' ? '' : previewPagePath.value
  const url = new URL(sitePreviewBaseUrl.value + subPath)
  url.searchParams.set('preview', 'true')
  if (previewToken.value) url.searchParams.set('token', previewToken.value)
  if (currentPageIsLocationScoped.value && selectedLocation.value) {
    url.searchParams.set('location', selectedLocation.value.slug)
  }
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

const computedSiteStatus = computed((): 'setup' | 'progress' | 'ready' | 'live' => {
  if (!siteData.value) return 'setup'
  if (siteData.value.status === 'active') return 'live'
  if (readinessScore.value >= 80) return 'ready'
  if (readinessScore.value > 0) return 'progress'
  return 'setup'
})

const readinessDoneCount = computed(() =>
  READINESS_CATEGORIES.filter(c => readiness.value[c.key] === 'complete').length
)

const readinessScore = computed(() => {
  const weights: Record<ReadinessState, number> = { complete: 100 / 6, attention: 50 / 6, missing: 0 }
  return READINESS_CATEGORIES.reduce((sum, c) => sum + (weights[readiness.value[c.key] ?? 'missing'] ?? 0), 0)
})

const scoreHeadline = computed(() => {
  if (computedSiteStatus.value === 'live') return 'Live and looking sharp'
  if (readinessScore.value >= 90) return 'Ready to launch'
  if (readinessScore.value >= 50) return 'Coming together'
  if (readinessScore.value > 0) return 'In progress'
  return 'Setup · not started'
})

// ─── Load context ─────────────────────────────────────────────────────────────
const loadContext = async () => {
  try {
    // Ensure dashboard restaurant context is loaded (same source as useChowBot)
    if (!dashboard.state.value) await dashboard.refresh()

    if (dashboard.siteId.value) {
      // Load editor-specific context (preview token, locations)
      const response = await $fetch<{ context: ApiValue }>(`/api/dashboard/editor/context`)
      siteData.value = response.context.site
      siteLocations.value = response.context.locations || []
      previewToken.value = response.context.previewToken
      // Default to primary location for location-scoped pages
      const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]
      if (primary) selectedLocationId.value = primary.id
    }
  } catch {
    // Site may not exist yet — that's fine, agent panel handles setup mode
  } finally {
    contextLoaded.value = true
  }
}

const loadReadiness = async () => {
  try {
    const data = await $fetch<{
      items: { business_info: boolean; hero_image: boolean; menu_or_experiences: boolean; story: boolean; post: boolean }
    }>(`/api/dashboard/onboarding/checklist`)

    readiness.value = {
      details: data.items.business_info ? 'complete' : 'missing',
      hero: data.items.hero_image ? 'complete' : 'missing',
      offer: data.items.menu_or_experiences ? 'complete' : 'missing',
      brand: data.items.story ? 'complete' : data.items.business_info ? 'attention' : 'missing',
      trust: data.items.post ? 'complete' : data.items.business_info ? 'attention' : 'missing',
      launch: (data.items.business_info && data.items.hero_image && data.items.menu_or_experiences) ? 'attention' : 'missing',
    }
  } catch {
    // Not critical, readiness stays at default
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────
const onSelectPage = (page: string) => {
  selectedPreviewPage.value = page
  // When switching to location-scoped page, ensure a location is selected
  if (locationScopedPages.has(page) && !selectedLocationId.value && siteLocations.value.length > 0) {
    const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]!
    selectedLocationId.value = primary.id
  }
}

const onSelectLocation = (id: string) => {
  selectedLocationId.value = id
}

const handleExit = () => {
  const orgSlug = route.params.orgSlug as string
  router.push(`/dashboard/${orgSlug}`)
}

const handleSaveLater = () => {
  toast.add({ description: 'Progress saved. You can resume from here anytime.', color: 'success' })
  handleExit()
}

// Reload preview when agent makes changes
const { messages } = useChowBot()
let lastMessageCount = 0
watch(messages, (msgs) => {
  if (msgs.length > lastMessageCount) {
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant' && !last.streaming && last.toolCalls?.length) {
      previewReloadToken.value = Date.now()
      loadReadiness()
    }
  }
  lastMessageCount = msgs.length
})

// ─── Toast from query params ──────────────────────────────────────────────────
onMounted(async () => {
  await loadContext()
  await loadReadiness()

  if (route.query.payment === 'cancelled') {
    toast.add({ title: 'Payment cancelled', description: 'Your subscription was not completed.', color: 'warning' })
  }
  if (route.query.new === 'true') {
    toast.add({ title: 'Welcome', description: 'Your site has been created.', color: 'success' })
  }
})
</script>
