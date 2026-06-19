<template>
  <div class="flex h-screen flex-col overflow-hidden bg-muted text-highlighted">

    <!-- Top bar -->
    <header class="flex h-[60px] shrink-0 items-center gap-4 border-b border-default bg-default px-5">
      <div class="flex items-center gap-2.5">
        <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="h-7 w-auto" />
      </div>
      <div class="h-[22px] w-px bg-default-200 dark:bg-default-700" />
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-[13px] font-semibold text-highlighted">{{ siteName }}</span>
        <span class="truncate font-mono text-[10.5px] text-dimmed">{{ siteDomain }} · live</span>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <UButton color="neutral" variant="ghost" size="sm" :to="`/dashboard/${orgSlug}`">
          Skip setup
        </UButton>
      </div>
    </header>

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
        @done="finish"
      />
      <OnboardingPreviewPane
        :iframe-src="iframeSrc"
        :site-locations="previewLocations"
        :selected-location-id="selectedLocationId"
        :selected-page="selectedPage"
        site-status="live"
        :site-domain="siteDomain"
        @select-page="selectedPage = $event"
        @select-location="selectedLocationId = $event"
      />
    </div>

    <div v-else class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex items-center gap-3 text-muted">
        <UIcon name="i-heroicons-arrow-path" class="size-5 animate-spin" />
        <span class="text-sm">Loading your site…</span>
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
      restaurant?: { id: string; brand_name: string; subdomain: string; plan: string } | null
    }>('/api/dashboard/context')

    if (ctx.restaurant) {
      siteId.value = ctx.restaurant.id
      siteName.value = ctx.restaurant.brand_name ?? 'Your Site'
      subdomain.value = ctx.restaurant.subdomain ?? ''
      plan.value = ctx.restaurant.plan ?? 'free'
    }

    if (!siteId.value) return

    const [locsRes, notifRes] = await Promise.all([
      $fetch<{ locations: LocationRow[] }>('/api/dashboard/locations'),
      $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>(
        `/api/editor/sites/${siteId.value}/notifications`
      ).catch(() => null),
    ])

    locations.value = locsRes.locations ?? []
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
