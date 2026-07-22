<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <!-- Body: wizard left, preview right. Single column with vertical scroll
         below sm so the wizard pane (min 24rem) never gets hard-clipped by
         overflow-hidden on narrow viewports; two-column split from sm up. -->
    <div
      v-if="loaded && !loadError"
      class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto sm:grid-cols-[minmax(24rem,45%)_1fr] sm:overflow-hidden"
      style="grid-template-rows: minmax(0, 1fr)"
    >
      <TransferOnboardingWizard
        :site-id="siteId"
        :org-slug="orgSlug"
        :site-name="siteName"
        :site-domain="siteDomain"
        :locations="locations"
        :plan="plan"
        :owner-phone="ownerPhone"
        :vertical="siteVertical"
        @done="finish"
      />
      <OnboardingPreviewPane
        :iframe-src="iframeSrc"
        :site-locations="previewLocations"
        :selected-location-id="selectedLocationId"
        :selected-page="selectedPage"
        site-status="live"
        :site-domain="siteDomain"
        :vertical="siteVertical"
        @select-page="selectedPage = $event"
        @select-location="selectedLocationId = $event"
      />
    </div>

    <div v-else-if="loadError" class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-center">
        <UIcon name="i-lucide-triangle-alert" class="size-6 text-error" />
        <p class="text-sm text-muted">We couldn't load your site. Please try again.</p>
        <UButton size="sm" color="neutral" variant="soft" @click="loadTransferContext">
          Try again
        </UButton>
      </div>
    </div>

    <div v-else class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex items-center gap-3 text-muted">
        <UIcon name="i-lucide-refresh-cw" class="size-5 animate-spin" />
        <span class="text-sm">Loading your site…</span>
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

const orgSlug = computed(() => route.params.orgSlug as string)

interface LocationRow {
  id: string
  title: string
  slug: string
  is_primary: boolean
  notification_phone: string | null
}

const loaded = ref(false)
const loadError = ref(false)
const siteId = ref('')
const siteName = ref('Your Site')
const siteVertical = ref<SiteVertical>('restaurant')
const subdomain = ref('')
const plan = ref('free')
const ownerPhone = ref<string | null>(null)
const locations = ref<LocationRow[]>([])
const selectedLocationId = ref<string | null>(null)
const selectedPage = ref('home')

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain as string
  return domain.replace(/^https?:\/\//, '')
})

const siteDomain = computed(() =>
  subdomain.value ? `${subdomain.value}.${platformHostname.value}` : ''
)

const previewLocations = computed(() =>
  locations.value.map(l => ({ id: l.id, slug: l.slug, title: l.title, is_primary: l.is_primary }))
)

const selectedLocation = computed(() =>
  locations.value.find(l => l.id === selectedLocationId.value) ?? null
)

const platformBase = computed(() => {
  const base = ((config.public.platformDomain || config.public.freeSiteDomain) as string).replace(/\/$/, '')
  return `${base}/preview/site/${siteId.value}`
})

const iframeSrc = computed(() => {
  if (!siteId.value) return ''
  const locationScoped = ['location', 'menu'].includes(selectedPage.value)
  if (locationScoped && !selectedLocation.value) return ''
  let path = selectedPage.value === 'home' ? '' : `/${selectedPage.value}`
  if (locationScoped && selectedLocation.value) {
    path = selectedPage.value === 'location'
      ? `/locations/${selectedLocation.value.slug}`
      : `/locations/${selectedLocation.value.slug}/menu`
  }
  const url = new URL(platformBase.value + path)
  url.searchParams.set('preview', 'true')
  return url.toString()
})

async function loadTransferContext() {
  loaded.value = false
  loadError.value = false
  siteId.value = ''
  siteName.value = 'Your Site'
  siteVertical.value = 'restaurant'
  subdomain.value = ''
  plan.value = 'free'
  ownerPhone.value = null
  locations.value = []
  selectedLocationId.value = null
  selectedPage.value = 'home'
  try {
    const ctx = await $fetch<{
      success: boolean
      organization?: { id: string; slug: string } | null
      // vertical is the raw sites.vertical storage value (may be 'service',
      // the DB alias for professional_service — see
      // server/utils/dashboard-context.ts's DashboardSiteRow) — normalize it
      // below rather than narrowing the type here, which previously caused
      // every transferred professional_service/service site to silently
      // display as 'restaurant'.
      site?: { id: string; brand_name: string; vertical?: string | null; subdomain: string; plan: string } | null
    }>('/api/dashboard/context?afterTransfer=true')

    if (ctx.site) {
      siteId.value = ctx.site.id
      siteName.value = ctx.site.brand_name ?? 'Your Site'
      siteVertical.value = normalizeVertical(ctx.site.vertical) as SiteVertical
      subdomain.value = ctx.site.subdomain ?? ''
      plan.value = ctx.site.plan ?? 'free'
    }

    // A missing site is a genuine load failure, not "nothing to show yet" —
    // render the retry/error state rather than a wizard with an empty siteId.
    if (!siteId.value) {
      loadError.value = true
      return
    }

    // /api/sites/:siteId/locations is keyed purely by siteId + session
    // membership — unlike /api/dashboard/locations, it needs no site-slug
    // header, so it works for a transferred site with no subdomain yet
    // (custom-domain-only) instead of silently losing that site's locations.
    const [locsRes, notifRes] = await Promise.all([
      $fetch<{ success: boolean; locations: LocationRow[] }>(`/api/sites/${siteId.value}/locations`),
      $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>(
        `/api/editor/sites/${siteId.value}/notifications`
      ),
    ])

    locations.value = locsRes?.locations ?? []
    const primary = locations.value.find(l => l.is_primary) ?? locations.value[0]
    if (primary) selectedLocationId.value = primary.id

    if (notifRes?.notifications?.whatsapp_phone) {
      ownerPhone.value = notifRes.notifications.whatsapp_phone
    }
  } catch (e) {
    console.error('transfer_onboarding_load_failed', e)
    loadError.value = true
  } finally {
    loaded.value = true
  }
}

onMounted(loadTransferContext)

function finish() {
  router.push(`/dashboard/${orgSlug.value}`)
}
</script>
