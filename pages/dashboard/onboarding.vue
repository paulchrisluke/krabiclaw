<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <div
      v-if="contextLoaded && !contextError"
      class="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[minmax(24rem,45%)_1fr]"
    >
      <OnboardingWizard
        mode="new-site"
        :site-id="siteId"
        :existing-org-slug="orgSlug"
        :existing-site-slug="siteData?.subdomain ?? null"
        @site-created="onSiteCreated"
        @draft-saved="onDraftSaved"
        @draft-cleared="onDraftCleared"
        @vertical-selected="selectedOnboardingVertical = $event"
        @step-changed="activeOnboardingStep = $event"
      />
      <OnboardingPreviewPane
        v-if="!isMobilePreviewViewport"
        class="hidden md:flex"
        :iframe-src="iframeSrc"
        :site-locations="previewLocations"
        :selected-location-id="selectedLocationId"
        :selected-page="selectedPreviewPage"
        :site-status="computedSiteStatus"
        :site-domain="siteDomain"
        :vertical="previewVertical"
        :empty-visual-url="preDraftVisual.url"
        :empty-visual-alt="preDraftVisual.alt"
        home-only
        @select-page="onSelectPage"
        @select-location="onSelectLocation"
      />
    </div>

    <USlideover
      v-if="isMobilePreviewViewport"
      v-model:open="mobilePreviewOpenForViewport"
      title="Site preview"
      side="bottom"
      :close="false"
      :ui="{ content: 'h-[82vh] overflow-hidden rounded-t-2xl', header: 'sr-only', body: 'flex min-h-0 p-0 sm:p-0' }"
    >
      <template #body>
        <OnboardingPreviewPane
          class="min-h-0 flex-1"
          :iframe-src="iframeSrc"
          :site-locations="previewLocations"
          :selected-location-id="selectedLocationId"
          :selected-page="selectedPreviewPage"
          :site-status="computedSiteStatus"
          :site-domain="siteDomain"
          :vertical="previewVertical"
          :empty-visual-url="preDraftVisual.url"
          :empty-visual-alt="preDraftVisual.alt"
          home-only
          @select-page="onSelectPage"
          @select-location="onSelectLocation"
        />
      </template>
    </USlideover>

    <div v-if="!contextLoaded" class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex items-center gap-3 text-muted">
        <UIcon name="i-lucide-refresh-cw" class="size-5 animate-spin" />
        <span class="text-sm">Loading workspace…</span>
      </div>
    </div>
    <div v-else-if="contextError" class="flex min-h-0 flex-1 items-center justify-center p-6">
      <UCard class="w-full max-w-md text-center">
        <h1 class="text-lg font-semibold text-highlighted">Workspace could not be loaded</h1>
        <p class="mt-2 text-sm text-muted">{{ contextError.message }}</p>
        <UButton class="mt-6" :loading="contextRetrying" @click="retryContext">
          Try again
        </UButton>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

// Manages its own workspace context via /api/dashboard/onboarding-context —
// this route has no orgSlug segment (a brand-new user may have zero
// organizations), so it never calls useDashboardSite and must not be gated
// on that context ever loading. See layouts/editor.vue.
definePageMeta({ layout: 'editor', skipDashboardContext: true })

const route = useRoute()
const config = useRuntimeConfig()
const toast = useToast()

// ─── State ────────────────────────────────────────────────────────────────────
const siteData = ref<ApiRecord | null>(null)
const selectedOnboardingVertical = ref<SiteVertical>('restaurant')
const activeOnboardingStep = ref('welcome')
const previewVertical = computed<SiteVertical>(() =>
  siteData.value
    ? normalizeVertical(siteData.value.vertical as string | undefined) as SiteVertical
    : selectedOnboardingVertical.value
)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const orgSlug = ref<string | null>(null)
const previewToken = ref('')
const draftPreview = ref<{
  draftId: string
  previewToken: string
  draftName: string
  subdomainCandidate: string
} | null>(null)
const mobilePreviewOpen = ref(false)
const isMobilePreviewViewport = ref(false)
const contextLoaded = ref(false)
const contextError = ref<Error | null>(null)
const contextRetrying = ref(false)
type ReadinessState = 'complete' | 'attention' | 'missing'

const readiness = ref<Record<'brand' | 'hero' | 'details' | 'offer' | 'trust' | 'launch', ReadinessState>>({
  brand: 'missing', hero: 'missing', details: 'missing',
  offer: 'missing', trust: 'missing', launch: 'missing',
})

// Preview selections
const selectedLocationId = ref<string | null>(null)
const selectedPreviewPage = ref('home')
const previewReloadToken = ref(0)

// ─── Computed ─────────────────────────────────────────────────────────────────
// Site ID comes from context loading, not dashboard composable (since org may not exist yet)
const siteId = computed<string | null>(() => siteData.value?.id ?? null)

const sitePreviewBaseUrl = computed(() => {
  if (!siteData.value?.id) return ''
  return `/preview/site/${siteData.value.id}`
})

const draftPreviewBaseUrl = computed(() => {
  if (!draftPreview.value?.draftId) return ''
  return `/preview/draft/${draftPreview.value.draftId}`
})

const previewLocations = computed(() => {
  if (draftPreview.value) return [{
    id: draftPreview.value.draftId,
    slug: draftPreview.value.subdomainCandidate,
    title: draftPreview.value.draftName,
    is_primary: true,
  }]
  if (siteLocations.value.length > 0) return siteLocations.value
  return []
})

const selectedLocation = computed(() =>
  previewLocations.value.find(l => l.id === selectedLocationId.value) ?? previewLocations.value[0] ?? null
)

const siteDomain = computed(() => {
  if (draftPreview.value?.subdomainCandidate) {
    const host = (config.public.freeSiteDomain as string).replace(/^https?:\/\//, '')
    return `${draftPreview.value.subdomainCandidate}.${host}`
  }
  const domain = siteData.value?.subdomain
  if (!domain) return ''
  const host = (config.public.freeSiteDomain as string).replace(/^https?:\/\//, '')
  return `${domain}.${host}`
})

const locationScopedPages = new Set(['location', 'menu'])
const currentPageIsLocationScoped = computed(() => locationScopedPages.has(selectedPreviewPage.value))

const previewPagePath = computed(() => {
  if (draftPreview.value) {
    if (selectedPreviewPage.value === 'location') return '/'
    if (selectedPreviewPage.value === 'menu') return '/menu'
    return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
  }
  if (!selectedLocation.value) return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
  if (selectedPreviewPage.value === 'location') return `/locations/${selectedLocation.value.slug}`
  if (selectedPreviewPage.value === 'menu') return `/locations/${selectedLocation.value.slug}/menu`
  return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
})

// SSR-safe origin — derived from the incoming request on the server and from
// window.location on the client. This page now renders server-side (SSR is
// no longer disabled here), so a bare window.location.origin read inside a
// computed the template evaluates would throw during SSR.
const requestURL = useRequestURL()

const iframeSrc = computed(() => {
  const baseUrl = draftPreview.value ? draftPreviewBaseUrl.value : sitePreviewBaseUrl.value
  if (!baseUrl) return ''
  if (currentPageIsLocationScoped.value && !selectedLocation.value && !draftPreview.value) return ''
  const subPath = previewPagePath.value === '/' ? '' : previewPagePath.value
  const url = new URL(baseUrl + subPath, requestURL.origin)
  url.searchParams.set('preview', 'true')
  const token = draftPreview.value?.previewToken ?? previewToken.value
  if (token) url.searchParams.set('token', token)
  if (currentPageIsLocationScoped.value && selectedLocation.value && !draftPreview.value) {
    url.searchParams.set('location', selectedLocation.value.slug)
  }
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})
const PRE_DRAFT_VISUALS = {
  welcome: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/b9f925eb-0b91-4b62-d0e6-8db5df900700/w=800',
    alt: 'Start building your KrabiClaw site',
  },
  vertical: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/9c594a4f-41c8-4c81-3545-fe08d9a70c00/w=800',
    alt: 'Choose your business type',
  },
  source: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/3c0e50cb-6390-46e9-4143-e8e68fa89900/w=800',
    alt: 'Choose how to add business details',
  },
  businessName: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/8be9a754-ef8f-4452-3fc0-90bfa24f2600/w=800',
    alt: 'Add your business name',
  },
  google: {
    url: 'https://imagedelivery.net/Frxyb2_d_vGyiaXhS5xqCg/1952e5fa-e460-46f0-e50a-057dce7e8a00/w=800',
    alt: 'Add business details from Google Maps',
  },
} as const
const preDraftVisual = computed(() => {
  if (iframeSrc.value) return { url: '', alt: '' }
  if (activeOnboardingStep.value === 'awaiting_manual_name') return PRE_DRAFT_VISUALS.businessName
  if (activeOnboardingStep.value === 'awaiting_url') return PRE_DRAFT_VISUALS.google
  if (activeOnboardingStep.value === 'source') return PRE_DRAFT_VISUALS.source
  if (activeOnboardingStep.value === 'vertical') return PRE_DRAFT_VISUALS.vertical
  if (activeOnboardingStep.value === 'welcome') return PRE_DRAFT_VISUALS.welcome
  return { url: '', alt: '' }
})

const computedSiteStatus = computed((): 'setup' | 'progress' | 'ready' | 'live' => {
  if (draftPreview.value) return 'progress'
  if (!siteData.value) return 'setup'
  if (siteData.value.status === 'active') return 'live'
  if (readinessScore.value >= 80) return 'ready'
  if (readinessScore.value > 0) return 'progress'
  return 'setup'
})

const mobilePreviewOpenForViewport = computed({
  get: () => isMobilePreviewViewport.value && mobilePreviewOpen.value,
  set: value => {
    mobilePreviewOpen.value = value
  },
})

let stopMobilePreviewViewportListener: (() => void) | null = null

const readinessScore = computed(() => {
  const weights: Record<ReadinessState, number> = { complete: 100 / 6, attention: 50 / 6, missing: 0 }
  return Object.values(readiness.value).reduce((sum, state) => sum + (weights[state] ?? 0), 0)
})

// ─── Load context ─────────────────────────────────────────────────────────────

interface OnboardingContextResponse {
  success: true
  context: {
    organization?: { id: string; slug: string; name: string } | null
    site?: ApiRecord | null
    locations?: Array<{ id: string; slug: string; title: string; is_primary: boolean }>
  }
  previewToken: string | null
  checklist: {
    items: { business_info: boolean; hero_image: boolean; core_offering: boolean; story: boolean; post: boolean }
  }
}

const isOnboardingContextResponse = (value: unknown): value is OnboardingContextResponse => {
  if (!isRecord(value)
    || value.success !== true
    || !isRecord(value.context)
    || (value.previewToken !== null && typeof value.previewToken !== 'string')
    || !isRecord(value.checklist)
    || !isRecord(value.checklist.items)) return false
  const items = value.checklist.items
  return ['business_info', 'hero_image', 'core_offering', 'story', 'post']
    .every(key => typeof items[key] === 'boolean')
}

const requestEvent = useRequestEvent()
const loadContextResource = async (): Promise<OnboardingContextResponse> => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadDashboardOnboardingContext } = await import('~/server/utils/onboarding-context')
    return await loadDashboardOnboardingContext(requestEvent)
  }
  return await applicationFetch<OnboardingContextResponse>('/api/dashboard/onboarding-context', {
    validate: isOnboardingContextResponse,
  })
}

const applyContext = (response: OnboardingContextResponse) => {
  if (response.context.organization) orgSlug.value = response.context.organization.slug
  if (response.context.site) {
    siteData.value = response.context.site
    siteLocations.value = response.context.locations ?? []
    const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]
    if (primary) selectedLocationId.value = primary.id
  }
  previewToken.value = response.previewToken ?? ''
  const items = response.checklist.items
  readiness.value = {
    details: items.business_info ? 'complete' : 'missing',
    hero: items.hero_image ? 'complete' : 'missing',
    offer: items.core_offering ? 'complete' : 'missing',
    brand: items.story ? 'complete' : items.business_info ? 'attention' : 'missing',
    trust: items.post ? 'complete' : items.business_info ? 'attention' : 'missing',
    launch: (items.business_info && items.hero_image && items.core_offering) ? 'attention' : 'missing',
  }
}

const { data: contextResource, error: initialContextError, refresh: refreshContext } =
  await useAsyncData('dashboard-onboarding-context', loadContextResource)
if (contextResource.value) applyContext(contextResource.value)
if (initialContextError.value) contextError.value = normalizeApiError(initialContextError.value, 'Workspace context failed')
contextLoaded.value = true

const loadContext = async () => {
  contextError.value = null
  try {
    await refreshContext()
    // Nuxt's useAsyncData retains the previous successful `data` value when a
    // refresh fails, so a failed retry can leave contextResource.value still
    // truthy (holding the *old* response) while error.value reflects the new
    // failure — check the error first, or stale context gets silently
    // reapplied as if the retry had succeeded.
    if (initialContextError.value) throw initialContextError.value
    if (!contextResource.value) throw new Error('Workspace context returned no data')
    applyContext(contextResource.value)
  } catch (error) {
    contextError.value = normalizeApiError(error, 'Workspace context failed')
  } finally {
    contextLoaded.value = true
  }
}

const retryContext = async () => {
  contextRetrying.value = true
  try {
    await loadContext()
  } finally {
    contextRetrying.value = false
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────
const onSelectPage = (page: string) => {
  selectedPreviewPage.value = page
  // When switching to location-scoped page, ensure a location is selected
  if (locationScopedPages.has(page) && !selectedLocationId.value && previewLocations.value.length > 0) {
    const primary = previewLocations.value.find(l => l.is_primary) ?? previewLocations.value[0]
    if (primary) {
      selectedLocationId.value = primary.id
    }
  }
}

const onSelectLocation = (id: string) => {
  selectedLocationId.value = id
}

const onSiteCreated = async (_orgSlug: string | null) => {
  draftPreview.value = null
  await retryContext()
  if (!contextError.value) previewReloadToken.value = Date.now()
}

const onDraftSaved = (draft: {
  draftId: string
  previewToken: string
  draftName: string
  subdomainCandidate: string
}) => {
  draftPreview.value = draft
  selectedLocationId.value = draft.draftId
  previewReloadToken.value = Date.now()
  mobilePreviewOpen.value = isMobilePreviewViewport.value
}

const onDraftCleared = () => {
  draftPreview.value = null
  selectedLocationId.value = null
  previewReloadToken.value = Date.now()
}

// ─── Toast from query params ──────────────────────────────────────────────────
onMounted(async () => {
  const mobilePreviewQuery = window.matchMedia('(max-width: 767.98px)')
  const updateMobilePreviewViewport = () => {
    isMobilePreviewViewport.value = mobilePreviewQuery.matches
    if (!mobilePreviewQuery.matches) mobilePreviewOpen.value = false
  }
  updateMobilePreviewViewport()
  mobilePreviewQuery.addEventListener('change', updateMobilePreviewViewport)
  stopMobilePreviewViewportListener = () => mobilePreviewQuery.removeEventListener('change', updateMobilePreviewViewport)

  if (route.query.payment === 'cancelled') {
    toast.add({ title: 'Payment cancelled', description: 'Your subscription was not completed.', color: 'warning' })
  }
  if (route.query.new === 'true') {
    toast.add({ title: 'Welcome', description: 'Your site has been created.', color: 'success' })
  }
})

onUnmounted(() => {
  stopMobilePreviewViewportListener?.()
  stopMobilePreviewViewportListener = null
})
</script>
