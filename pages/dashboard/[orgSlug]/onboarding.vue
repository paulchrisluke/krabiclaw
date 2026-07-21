<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <!-- Body: wizard left, preview right -->
    <div
      v-if="loaded"
      class="grid min-h-0 flex-1 overflow-hidden"
      style="grid-template-columns: minmax(24rem, 45%) 1fr; grid-template-rows: minmax(0, 1fr)"
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

    <div v-else class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex items-center gap-3 text-muted">
        <UIcon name="i-lucide-refresh-cw" class="size-5 animate-spin" />
        <span class="text-sm">Loading your site…</span>
      </div>
    </div>

    <AppToast />
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

onMounted(async () => {
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

    if (!siteId.value) return

    // This route has no siteSlug segment, so the dashboard-site-header plugin never
    // attaches a header — set it explicitly so /api/dashboard/locations resolves the
    // same site /api/dashboard/context just found instead of hitting the generic
    // multi-site-ambiguity 400. A transferred site without a subdomain (custom-domain-only)
    // has no header value to send, so skip the call rather than letting it 404 and take
    // down the already-resolved notifRes via Promise.all's fail-fast rejection.
    const [locsRes, notifRes] = await Promise.all([
      subdomain.value
        ? $fetch<{ locations: LocationRow[] }>('/api/dashboard/locations', {
            headers: { 'x-dashboard-site-slug': subdomain.value },
          }).catch(() => null)
        : Promise.resolve(null),
      $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>(
        `/api/editor/sites/${siteId.value}/notifications`
      ).catch(() => null),
    ])

    locations.value = locsRes?.locations ?? []
    const primary = locations.value.find(l => l.is_primary) ?? locations.value[0]
    if (primary) selectedLocationId.value = primary.id

    if (notifRes?.notifications?.whatsapp_phone) {
      ownerPhone.value = notifRes.notifications.whatsapp_phone
    }
  } catch (e) {
    console.error('transfer_onboarding_load_failed', e)
  } finally {
    loaded.value = true
  }
})

function finish() {
  router.push(`/dashboard/${orgSlug.value}`)
}
</script>
