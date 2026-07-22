<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <!-- ─── Body ─────────────────────────────────────────────────────────── -->
    <div
      v-if="contextLoaded"
      class="grid min-h-0 flex-1 overflow-hidden"
      style="grid-template-columns: minmax(24rem, 45%) 1fr; grid-template-rows: minmax(0, 1fr)"
    >
      <OnboardingWizard
        mode="new-site"
        :site-id="siteId"
        :existing-org-slug="orgSlug"
        :existing-site-slug="siteData?.subdomain ?? null"
        @site-created="onSiteCreated"
        @draft-saved="onDraftSaved"
      />
      <OnboardingPreviewPane
        :iframe-src="iframeSrc"
        :site-locations="previewLocations"
        :selected-location-id="selectedLocationId"
        :selected-page="selectedPreviewPage"
        :site-status="computedSiteStatus"
        :site-domain="siteDomain"
        :vertical="previewVertical"
        @select-page="onSelectPage"
        @select-location="onSelectLocation"
      />
    </div>

    <!-- Loading state -->
    <div v-else class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex items-center gap-3 text-muted">
        <UIcon name="i-lucide-refresh-cw" class="size-5 animate-spin" />
        <span class="text-sm">Loading workspace…</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'editor', ssr: false })

const route = useRoute()
const config = useRuntimeConfig()
const toast = useToast()

// ─── State ────────────────────────────────────────────────────────────────────
const siteData = ref<ApiRecord | null>(null)
const previewVertical = computed<SiteVertical>(() => normalizeVertical(siteData.value?.vertical as string | undefined) as SiteVertical)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const orgSlug = ref<string | null>(null)
const previewToken = ref('')
const draftPreview = ref<{
  draftId: string
  previewToken: string
  draftName: string
  subdomainCandidate: string
} | null>(null)
const contextLoaded = ref(false)
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
  const platformBase = ((config.public.platformDomain || config.public.freeSiteDomain) as string).replace(/\/$/, '')
  if (draftPreview.value?.draftId) return `${platformBase}/preview/draft/${draftPreview.value.draftId}`
  if (!siteData.value?.id) return ''
  return `${platformBase}/preview/site/${siteData.value.id}`
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
    // Draft previews don't support location-scoped routes
    if (selectedPreviewPage.value === 'location') return '/'
    if (selectedPreviewPage.value === 'menu') return '/menu'
    return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
  }
  if (!selectedLocation.value) return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
  if (selectedPreviewPage.value === 'location') return `/locations/${selectedLocation.value.slug}`
  if (selectedPreviewPage.value === 'menu') return `/locations/${selectedLocation.value.slug}/menu`
  return selectedPreviewPage.value === 'home' ? '/' : `/${selectedPreviewPage.value}`
})

const iframeSrc = computed(() => {
  if (!sitePreviewBaseUrl.value) return ''
  if (currentPageIsLocationScoped.value && !selectedLocation.value && !draftPreview.value) return ''
  const subPath = previewPagePath.value === '/' ? '' : previewPagePath.value
  const url = new URL(sitePreviewBaseUrl.value + subPath)
  url.searchParams.set('preview', 'true')
  const token = draftPreview.value?.previewToken ?? previewToken.value
  if (token) url.searchParams.set('token', token)
  if (currentPageIsLocationScoped.value && selectedLocation.value && !draftPreview.value) {
    url.searchParams.set('location', selectedLocation.value.slug)
  }
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

const computedSiteStatus = computed((): 'setup' | 'progress' | 'ready' | 'live' => {
  if (draftPreview.value) return 'progress'
  if (!siteData.value) return 'setup'
  if (siteData.value.status === 'active') return 'live'
  if (readinessScore.value >= 80) return 'ready'
  if (readinessScore.value > 0) return 'progress'
  return 'setup'
})

const readinessScore = computed(() => {
  const weights: Record<ReadinessState, number> = { complete: 100 / 6, attention: 50 / 6, missing: 0 }
  return Object.values(readiness.value).reduce((sum, state) => sum + (weights[state] ?? 0), 0)
})

// ─── Load context ─────────────────────────────────────────────────────────────

// Step 1 — fast org/site resolution (works even when site doesn't exist yet)
const loadContext = async () => {
  try {
    const response = await $fetch<{
      success: boolean
      organization?: { id: string; slug: string; name: string } | null
      site?: ApiRecord | null
      locations?: Array<{ id: string; slug: string; title: string; is_primary: boolean }>
    }>('/api/dashboard/context')

    if (response.organization) orgSlug.value = response.organization.slug ?? null
    if (response.site) {
      siteData.value = response.site
      siteLocations.value = response.locations ?? []
      const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]
      if (primary) selectedLocationId.value = primary.id
      // Step 2 — get preview token now that we have a site
      await loadPreviewToken()
    }
  } catch {
    // No org/site yet — expected for new users
  } finally {
    contextLoaded.value = true
  }
}

// Step 2 — editor context includes the signed preview token needed to render draft sites
const loadPreviewToken = async () => {
  try {
    const res = await $fetch<{ context: { previewToken: string } }>('/api/dashboard/editor/context')
    if (res.context?.previewToken) previewToken.value = res.context.previewToken
  } catch {
    // Non-fatal — preview still works if onboarding_status is 'active' (it will be after setup)
  }
}

const loadReadiness = async () => {
  if (!siteId.value) return

  try {
    const data = await $fetch<{
      items: { business_info: boolean; hero_image: boolean; core_offering: boolean; story: boolean; post: boolean }
    }>(`/api/dashboard/onboarding/checklist?siteId=${siteId.value}`)

    readiness.value = {
      details: data.items.business_info ? 'complete' : 'missing',
      hero: data.items.hero_image ? 'complete' : 'missing',
      offer: data.items.core_offering ? 'complete' : 'missing',
      brand: data.items.story ? 'complete' : data.items.business_info ? 'attention' : 'missing',
      trust: data.items.post ? 'complete' : data.items.business_info ? 'attention' : 'missing',
      launch: (data.items.business_info && data.items.hero_image && data.items.core_offering) ? 'attention' : 'missing',
    }
  } catch {
    // Not critical, readiness stays at default
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

// Called by OnboardingWizard after the site is created — reload context + preview token, populate preview pane
const onSiteCreated = async (_orgSlug: string | null) => {
  draftPreview.value = null
  await loadContext()        // sets siteData + calls loadPreviewToken()
  await loadReadiness()
  previewReloadToken.value = Date.now()
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
}

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
