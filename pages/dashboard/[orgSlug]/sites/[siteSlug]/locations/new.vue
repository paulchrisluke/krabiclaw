<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <header class="flex h-[60px] shrink-0 items-center gap-4 border-b border-default bg-default px-5">
      <div class="flex items-center gap-2.5">
        <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="h-7 w-auto" />
      </div>
      <div class="h-[22px] w-px bg-default-200 dark:bg-default-700" />
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-[13px] font-semibold text-highlighted">Add a location</span>
        <span class="truncate font-mono text-[10.5px] text-dimmed">{{ orgSlug }}</span>
      </div>
      <div class="flex-1" />
      <UButton color="neutral" variant="ghost" size="sm" @click="router.push(`/dashboard/${orgSlug}/sites/${siteSlug}`)">
        Back to dashboard
      </UButton>
    </header>

    <div
      v-if="contextLoaded && !contextError"
      class="grid min-h-0 flex-1 overflow-hidden"
      style="grid-template-columns: minmax(24rem, 45%) 1fr; grid-template-rows: minmax(0, 1fr)"
    >
      <OnboardingWizard
        mode="add-location"
        :site-id="null"
        :existing-org-slug="orgSlug"
        :existing-site-slug="siteSlug"
        @site-created="onLocationCreated"
      />
      <OnboardingPreviewPane
        :iframe-src="iframeSrc"
        :site-locations="siteLocations"
        :selected-location-id="selectedLocationId"
        :selected-page="selectedPreviewPage"
        :site-status="computedSiteStatus"
        :site-domain="siteDomain"
        :vertical="previewVertical"
        @select-page="onSelectPage"
        @select-location="onSelectLocation"
      />
    </div>

    <div v-else-if="contextError" class="flex min-h-0 flex-1 items-center justify-center px-5">
      <UCard class="w-full max-w-md">
        <div class="space-y-3">
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="Workspace load failed"
            :description="contextError"
          />
          <div class="flex justify-end">
            <UButton color="neutral" variant="soft" size="sm" @click="loadContext">
              Try again
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

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
const router = useRouter()
const config = useRuntimeConfig()
const toast = useToast()

const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string

const siteData = ref<ApiRecord | null>(null)
const previewVertical = computed<SiteVertical>(() => normalizeVertical(siteData.value?.vertical as string | undefined) as SiteVertical)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const contextLoaded = ref(false)
const contextError = ref<string | null>(null)
const selectedLocationId = ref<string | null>(null)
const selectedPreviewPage = ref('home')
const previewReloadToken = ref(0)

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain as string
  return domain.replace(/^https?:\/\//, '')
})

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
  if (currentPageIsLocationScoped.value && selectedLocation.value) {
    url.searchParams.set('location', selectedLocation.value.slug)
  }
  if (previewReloadToken.value) url.searchParams.set('t', String(previewReloadToken.value))
  return url.toString()
})

const computedSiteStatus = computed((): 'setup' | 'progress' | 'ready' | 'live' =>
  siteData.value?.status === 'active' ? 'live' : 'setup'
)

const loadContext = async () => {
  contextError.value = null
  try {
    const response = await $fetch<{
      success: boolean
      site?: ApiRecord | null
      locations?: Array<{ id: string; slug: string; title: string; is_primary: boolean }>
    }>('/api/dashboard/context', { headers: buildDashboardRequestHeaders() })

    if (response.site) {
      siteData.value = response.site
      siteLocations.value = response.locations ?? []
    } else {
      contextError.value = 'Workspace data could not be loaded.'
    }
  } catch (error) {
    // This page requires an existing site, so a failed context load is unexpected here
    console.error('Failed to load dashboard context:', error)
    contextError.value = 'Failed to load workspace. Please try again.'
    toast.add({ description: 'Failed to load workspace. Please try again.', color: 'error' })
  } finally {
    contextLoaded.value = true
  }
}

const onSelectPage = (page: string) => {
  selectedPreviewPage.value = page
  if (locationScopedPages.has(page) && !selectedLocationId.value && siteLocations.value.length > 0) {
    const primary = siteLocations.value.find(l => l.is_primary) ?? siteLocations.value[0]
    if (primary) selectedLocationId.value = primary.id
  }
}

const onSelectLocation = (id: string) => {
  selectedLocationId.value = id
}

// Called by OnboardingWizard after the location is created — reload locations and preview the new one
const onLocationCreated = async (_orgSlug: string | null, locationSlug: string | null | undefined) => {
  await loadContext()
  previewReloadToken.value = Date.now()

  const created = locationSlug ? siteLocations.value.find(l => l.slug === locationSlug) : null
  if (created) selectedLocationId.value = created.id
}

onMounted(async () => {
  await loadContext()
})
</script>
