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
        :interactive="hydrated"
        :site-id="siteId"
        :org-slug="orgSlug"
        :site-slug="subdomain"
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

    <div v-else-if="paymentPending && !loadError" class="flex min-h-0 flex-1 items-center justify-center">
      <div class="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" />
        <p class="text-sm font-medium text-highlighted">Finishing your handoff…</p>
        <p class="text-sm text-muted">Your payment is being confirmed. This page will continue automatically.</p>
      </div>
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
const dashboardApi = useDashboardApi()
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import { parseTransferOnboardingQuery } from '~/shared/transfer-onboarding-query'

// Manages its own site-transfer context via loadTransferContext() below and
// never calls useDashboardSite — must not be gated on that unrelated
// context ever loading. See layouts/editor.vue.
definePageMeta({ layout: 'editor', skipDashboardContext: true })

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()

const orgSlug = computed(() => route.params.orgSlug as string)
const transferQueryScope = parseTransferOnboardingQuery(route.query)
if (transferQueryScope.kind === 'invalid') {
  throw createError({ statusCode: 400, statusMessage: transferQueryScope.message })
}
const transferId = computed(() => transferQueryScope.kind === 'exact' ? transferQueryScope.transferId : null)

interface LocationRow {
  id: string
  title: string
  slug: string
  is_primary: boolean
  notification_phone: string | null
}

interface TransferOnboardingContext {
  success: true
  state: 'payment_pending' | 'accepted'
  transfer_id?: string
  organization?: { id: string; slug: string } | null
  site?: { id: string; brand_name: string | null; vertical?: string | null; subdomain: string | null; plan: string | null } | null
  locations?: LocationRow[]
  notifications?: { whatsapp_phone: string | null; channels: string[] }
}

const loaded = ref(false)
const loadError = ref(false)
const paymentPending = ref(false)
const hydrated = ref(false)
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

function resetTransferContextState() {
  loaded.value = false
  loadError.value = false
  paymentPending.value = false
  siteId.value = ''
  siteName.value = 'Your Site'
  siteVertical.value = 'restaurant'
  subdomain.value = ''
  plan.value = 'free'
  ownerPhone.value = null
  locations.value = []
  selectedLocationId.value = null
  selectedPage.value = 'home'
}

function applyTransferContext(ctx: TransferOnboardingContext) {
  resetTransferContextState()
  if (ctx.state === 'payment_pending') {
    paymentPending.value = true
    return
  }
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

  locations.value = ctx.locations ?? []
  const primary = locations.value.find(l => l.is_primary) ?? locations.value[0]
  if (primary) selectedLocationId.value = primary.id

  if (ctx.notifications?.whatsapp_phone) {
    ownerPhone.value = ctx.notifications.whatsapp_phone
  }
  loaded.value = true
}

const isTransferOnboardingContext = (value: unknown): value is TransferOnboardingContext =>
  isRecord(value)
  && value.success === true
  && (
    (value.state === 'payment_pending' && typeof value.transfer_id === 'string' && value.transfer_id.length > 0)
    || (value.state === 'accepted' && isRecord(value.site) && Array.isArray(value.locations) && isRecord(value.notifications))
  )

const requestEvent = useRequestEvent()
const loadTransferContextResource = async (): Promise<TransferOnboardingContext> => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const { loadTransferOnboardingContext } = await import('~/server/utils/transfer-onboarding-context')
    return await loadTransferOnboardingContext(requestEvent, {
      orgSlug: orgSlug.value,
      ...(transferId.value ? { transferId: transferId.value } : {}),
    })
  }
  return await dashboardApi<TransferOnboardingContext>('/api/dashboard/transfer-onboarding-context', {
    query: transferId.value ? { transfer: transferId.value } : undefined,
    validate: isTransferOnboardingContext,
  })
}

const { data: transferContext, error: initialTransferContextError, refresh: refreshTransferContext } =
  await useAsyncData(`transfer-onboarding-context-${orgSlug.value}-${transferId.value ?? 'legacy'}`, loadTransferContextResource)

onMounted(() => {
  hydrated.value = true
  if (paymentPending.value) void pollUntilAccepted()
})

onUnmounted(() => {
  disposed = true
  resolvePollWait?.()
})

if (transferContext.value && !initialTransferContextError.value) {
  applyTransferContext(transferContext.value)
} else {
  loadError.value = true
}

const POLL_INTERVAL_MS = 1_500
const POLL_TIMEOUT_MS = 60_000
let pollTimer: ReturnType<typeof setTimeout> | null = null
let resolvePollWait: (() => void) | null = null
let pollLoop: Promise<void> | null = null
let disposed = false

function waitForPollInterval() {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      if (pollTimer === timer) {
        pollTimer = null
        resolvePollWait = null
      }
      resolve(true)
    }, POLL_INTERVAL_MS)
    pollTimer = timer
    resolvePollWait = () => {
      if (pollTimer === timer) {
        clearTimeout(timer)
        pollTimer = null
        resolvePollWait = null
      }
      resolve(false)
    }
  })
}

async function runPollUntilAccepted() {
  if (disposed || !transferId.value || !paymentPending.value) return
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline && !disposed && !loaded.value && !loadError.value) {
    if (!await waitForPollInterval() || disposed) return
    if (Date.now() >= deadline || disposed || loaded.value || loadError.value) break
    try {
      await refreshTransferContext()
      if (disposed) return
      if (initialTransferContextError.value) throw initialTransferContextError.value
      if (!transferContext.value || !isTransferOnboardingContext(transferContext.value)) {
        throw createError({ statusCode: 502, statusMessage: 'Transfer context unavailable' })
      }
      applyTransferContext(transferContext.value)
      if (loaded.value) return
    } catch (error) {
      console.error('transfer_onboarding_poll_failed', error)
      // Keep the finishing state for transient API failures until the bounded
      // deadline. A malformed response is never treated as an empty wizard.
    }
  }
  if (!disposed && paymentPending.value && !loaded.value) {
    paymentPending.value = false
    loadError.value = true
  }
}

function pollUntilAccepted() {
  if (pollLoop) return pollLoop
  const loopPromise = runPollUntilAccepted()
    .catch(error => {
      if (disposed) return
      console.error('transfer_onboarding_poll_failed', error)
      if (paymentPending.value) {
        paymentPending.value = false
        loadError.value = true
      }
    })
    .finally(() => {
      if (pollLoop === loopPromise) pollLoop = null
    })
  pollLoop = loopPromise
  return loopPromise
}

async function loadTransferContext() {
  resetTransferContextState()
  try {
    await refreshTransferContext()
    if (disposed) return
    // Nuxt retains the previous successful data value when refresh fails. Do
    // not reapply it: a failed retry must remain an explicit error state.
    if (initialTransferContextError.value) throw initialTransferContextError.value
    if (!transferContext.value) throw createError({ statusCode: 502, statusMessage: 'Transfer context unavailable' })
    applyTransferContext(transferContext.value)
    if (paymentPending.value) {
      void pollUntilAccepted()
    }
  } catch (e) {
    console.error('transfer_onboarding_load_failed', e)
    loadError.value = true
  } finally {
    if (!paymentPending.value && !loadError.value) loaded.value = true
  }
}

function finish() {
  router.push(subdomain.value
    ? `/dashboard/${orgSlug.value}/sites/${subdomain.value}`
    : `/dashboard/${orgSlug.value}`)
}
</script>
