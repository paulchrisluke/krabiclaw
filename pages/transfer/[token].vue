<template>
  <div class="min-h-screen bg-default">

    <!-- Loading -->
    <div v-if="loading" class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-3">
        <svg viewBox="0 0 24 24" fill="none" class="mx-auto size-10 animate-spin text-muted">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
        <p class="text-muted text-sm">Loading…</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <PlatformIcon name="exclamation-triangle" class="size-8 text-red-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">Transfer unavailable</h1>
        <p class="text-muted text-sm">{{ loadError }}</p>
        <PlatformButton to="/dashboard" variant="outline">Go to Dashboard</PlatformButton>
      </div>
    </div>

    <!-- Redirecting to checkout -->
    <div v-else-if="redirectingToCheckout" class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-4">
        <svg viewBox="0 0 24 24" fill="none" class="mx-auto size-10 animate-spin text-muted">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.25" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
        <h1 class="text-xl font-bold text-highlighted">Transfer complete!</h1>
        <p class="text-muted text-sm">Setting up your plan…</p>
      </div>
    </div>

    <!-- Accepted -->
    <div v-else-if="accepted" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <PlatformIcon name="check-circle" class="size-8 text-green-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">It's yours!</h1>
        <p class="text-muted text-sm"><strong class="text-default">{{ transfer!.site_name }}</strong> is now in your account.</p>
        <PlatformButton to="/dashboard">Open Dashboard</PlatformButton>
      </div>
    </div>

    <!-- Two-column layout -->
    <template v-else-if="transfer">
      <div class="lg:grid lg:grid-cols-2 lg:min-h-screen">

        <!-- Left: claim panel -->
        <div class="flex flex-col px-8 py-12 lg:px-12 max-w-lg mx-auto w-full lg:order-1 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto bg-default border-r border-default">

          <!-- Kicker -->
          <span class="self-start inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.3em] uppercase text-(--kc-teal-600) bg-(--kc-teal-100) px-3.5 py-1.5 rounded-full mb-6">
            <span class="w-1.5 h-1.5 rounded-full bg-(--kc-teal) shrink-0" />
            Your new website
          </span>

          <!-- Site name + builder -->
          <h1 class="text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.02] tracking-tight text-default text-balance m-0">{{ transfer.site_name }}</h1>
          <p class="mt-4 text-base text-muted">Prepared for you by the current site owner • This handoff stays active until it is completed or cancelled.</p>

          <!-- Personal note -->
          <p v-if="transfer.message" class="mt-5 text-sm italic text-muted border-l-2 border-default pl-3">
            "{{ transfer.message }}"
          </p>

          <!-- Details -->
          <div class="mt-6 space-y-3">
            <div v-if="transfer.invited_domain && transfer.domain_active" class="flex items-start gap-3 text-sm">
              <PlatformIcon name="globe" class="size-4 text-muted mt-0.5 shrink-0" />
              <span class="text-muted">Ready to launch at <strong class="text-default">{{ transfer.invited_domain }}</strong> (hosting included).</span>
            </div>

            <!-- Pricing block -->
            <div v-if="matchedPlan" class="mt-8">
              <!-- Monthly / Annual toggle -->
              <div v-if="transfer.pricing_year" class="flex items-center justify-center gap-1 mb-4 p-1 bg-muted/40 rounded-lg">
                <button
                  class="flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all"
                  :class="selectedInterval === 'month' ? 'bg-default shadow text-highlighted' : 'text-muted hover:text-default'"
                  @click="selectedInterval = 'month'"
                >Monthly</button>
                <button
                  class="flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all"
                  :class="selectedInterval === 'year' ? 'bg-default shadow text-highlighted' : 'text-muted hover:text-default'"
                  @click="selectedInterval = 'year'"
                >
                  Annual
                  <span v-if="annualSavingsPercent" class="ml-1 text-[10px] font-bold text-primary uppercase tracking-wide">
                    Save {{ annualSavingsPercent }}%
                  </span>
                </button>
              </div>

              <BillingPlanCard :plan="matchedPlan" :annual="selectedInterval === 'year'">
                <template #cta>
                  <!-- Custom discount callout if applicable -->
                  <div v-if="activePricing && activePricing.discounted_cents !== null" class="mb-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-center">
                    <div class="flex items-baseline justify-center gap-2">
                      <span class="text-xl font-bold text-highlighted">
                        <template v-if="selectedInterval === 'year'">${{ (activePricing.discounted_cents / 100 / 12).toFixed(2) }}<span class="text-sm font-normal text-muted">/mo</span></template>
                        <template v-else>${{ (activePricing.discounted_cents / 100).toFixed(2) }}<span class="text-sm font-normal text-muted">/mo</span></template>
                      </span>
                      <span class="text-xs text-muted line-through">
                        <template v-if="selectedInterval === 'year'">${{ (activePricing.base_cents / 100 / 12).toFixed(0) }}</template>
                        <template v-else>${{ (activePricing.base_cents / 100).toFixed(0) }}</template>
                      </span>
                    </div>
                    <p v-if="selectedInterval === 'year'" class="text-[11px] text-muted mt-0.5">billed ${{ (activePricing.discounted_cents / 100).toFixed(0) }}/year</p>
                    <p class="text-[11px] text-primary mt-1 font-semibold uppercase tracking-wide">
                      <template v-if="activePricing.coupon_duration === 'forever'">locked in forever</template>
                      <template v-else-if="activePricing.coupon_duration === 'repeating' && activePricing.coupon_duration_months">for {{ activePricing.coupon_duration_months }} months</template>
                      <template v-else>first {{ selectedInterval === 'year' ? 'year' : 'month' }}</template>
                    </p>
                  </div>
                  <p class="text-center text-xs text-muted mt-2">
                    <template v-if="transfer.requires_payment && transfer.invited_domain && transfer.domain_active">Payment is required before we transfer ownership and keep your custom domain live.</template>
                    <template v-else-if="transfer.requires_payment">Payment is required before we transfer ownership.</template>
                    <template v-else>Claim the site now and set up billing later if you want to upgrade.</template>
                  </p>
                </template>
              </BillingPlanCard>
            </div>

          </div><!-- /details -->

          <!-- Auth section -->
          <div class="mt-8 space-y-3">

            <!-- Not logged in -->
            <template v-if="!isAuthenticated && !sessionLoading">
              <AuthGoogleAuthButton :loading="authLoading" @activate="signInWithGoogle" />
              <PlatformButton block variant="outline" size="xl" class="rounded-[10px]" :to="emailLoginUrl">
                Sign in with email
              </PlatformButton>
              <p class="text-xs text-center text-muted">Sign in or create a free account to claim this site.</p>
            </template>

            <!-- Wrong email -->
            <template v-else-if="isAuthenticated && !emailMatches">
              <PlatformNotice tone="warning" title="Wrong account">
                This was sent to {{ transfer.to_email }}. You're signed in as {{ user?.email }}.
              </PlatformNotice>
              <PlatformButton block variant="outline" @click="switchAccount">Sign in with a different account</PlatformButton>
            </template>

            <!-- Ready -->
            <template v-else-if="isAuthenticated">
              <PlatformNotice tone="success">
                Signed in as {{ user?.email }}
              </PlatformNotice>
              <PlatformNotice v-if="transfer.requires_payment" tone="warning">
                This is a paid handoff. Checkout completes before the site moves into your account.
              </PlatformNotice>
              <PlatformNotice v-if="acceptError" tone="error">
                {{ acceptError }}
              </PlatformNotice>
              <PlatformButton block size="xl" class="rounded-[10px] shadow-sm hover:opacity-90" :loading="accepting" @click="acceptTransfer">
                {{ transfer.requires_payment ? 'Continue to checkout' : `Claim ${transfer.site_name}` }}
              </PlatformButton>
            </template>

          </div>

          <p class="mt-6 text-xs text-muted text-center">Don't want this? Ignore this link — nothing will happen.</p>
        </div>

        <!-- Right: live preview -->
        <div class="relative bg-muted/20 lg:order-2 lg:sticky lg:top-0 lg:h-screen overflow-hidden">
          <template v-if="iframeUrl">
            <!-- mobile strip (visual only) -->
            <div class="lg:hidden h-56 relative overflow-hidden border-b border-default">
              <iframe
                :src="iframeUrl"
                class="absolute top-0 left-0 w-full h-full border-none"
                style="pointer-events: none;"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                title="Site preview"
              />
              <a :href="iframeUrl" target="_blank" rel="noopener" class="absolute inset-0 flex items-end justify-end p-3">
                <span class="flex items-center gap-1.5 bg-default/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs font-medium text-default shadow border border-default">
                  <PlatformIcon name="arrow-up-right" class="size-3.5" />
                  Open full site
                </span>
              </a>
            </div>
            <!-- desktop: scrollable iframe -->
            <div class="hidden lg:block absolute inset-0">
              <iframe
                :src="iframeUrl"
                class="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                title="Site preview"
              />
              <!-- open button pinned top-right, doesn't block iframe -->
              <div class="absolute top-4 right-4 pointer-events-none">
                <a :href="iframeUrl" target="_blank" rel="noopener" class="pointer-events-auto flex items-center gap-1.5 bg-default/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm font-medium text-default shadow border border-default">
                  <PlatformIcon name="arrow-up-right" class="size-4" />
                  Open full site
                </a>
              </div>
            </div>
          </template>
          <div v-else class="flex items-center justify-center h-56 lg:h-full text-sm text-muted">
            Preview unavailable
          </div>
        </div>

      </div>
    </template>

  </div>
</template>

<script lang="ts">
export interface PricingInfo {
  base_cents: number
  discounted_cents: number | null
  coupon_duration: string | null
  coupon_duration_months: number | null
}

export interface TransferInfo {
  id: string
  site_id: string
  site_name: string
  site_subdomain: string | null
  to_email: string
  message: string | null
  invited_plan: string | null
  invited_coupon: string | null
  invited_interval: 'month' | 'year'
  pricing_month: PricingInfo | null
  pricing_year: PricingInfo | null
  invited_domain: string | null
  domain_active: boolean
  requires_payment: boolean
  never_expires: boolean
}

export interface AcceptTransferResponse {
  success: true
  site_id: string
  checkout_url?: string | null
}

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

const isNullableNonEmptyString = (value: unknown): value is string | null =>
  value === null || isNonEmptyString(value)

const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 0

const isSafeCheckoutUrl = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && Boolean(url.hostname)
      && !url.username
      && !url.password
  } catch {
    return false
  }
}

const isPricingInfo = (value: unknown): value is PricingInfo =>
  isRecordValue(value)
  && isSafeNonNegativeInteger(value.base_cents)
  && (value.discounted_cents === null || isSafeNonNegativeInteger(value.discounted_cents))
  && (value.coupon_duration === null || isNonEmptyString(value.coupon_duration))
  && (value.coupon_duration_months === null || isSafeNonNegativeInteger(value.coupon_duration_months))

export const isTransferInfoResponse = (value: unknown): value is TransferInfo =>
  isRecordValue(value)
  && isNonEmptyString(value.id)
  && isNonEmptyString(value.site_id)
  && isNonEmptyString(value.site_name)
  && isNullableString(value.site_subdomain)
  && isNonEmptyString(value.to_email)
  && isNullableString(value.message)
  && isNullableNonEmptyString(value.invited_plan)
  && isNullableNonEmptyString(value.invited_coupon)
  && (value.invited_interval === 'month' || value.invited_interval === 'year')
  && (value.pricing_month === null || isPricingInfo(value.pricing_month))
  && (value.pricing_year === null || isPricingInfo(value.pricing_year))
  && isNullableNonEmptyString(value.invited_domain)
  && typeof value.domain_active === 'boolean'
  && typeof value.requires_payment === 'boolean'
  && typeof value.never_expires === 'boolean'

export const isAcceptTransferResponse = (value: unknown): value is AcceptTransferResponse =>
  isRecordValue(value)
  && value.success === true
  && isNonEmptyString(value.site_id)
  && (value.checkout_url === undefined || value.checkout_url === null || isSafeCheckoutUrl(value.checkout_url))

export function buildTransferPreviewUrl(
  siteId: string | null | undefined,
  publicConfig: { freeSiteDomain?: unknown; platformDomain?: unknown },
): string {
  if (!isNonEmptyString(siteId)) return ''

  const configuredDomain = isNonEmptyString(publicConfig.platformDomain)
    ? publicConfig.platformDomain
    : isNonEmptyString(publicConfig.freeSiteDomain)
      ? publicConfig.freeSiteDomain
      : null
  if (!configuredDomain) return ''

  const rawDomain = configuredDomain.trim().replace(/\/+$/, '')
  const origin = /^[a-z][a-z\d+.-]*:\/\//i.test(rawDomain)
    ? rawDomain
    : `https://${rawDomain}`
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (!parsed.hostname) return ''
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return ''
    return `${parsed.origin}/preview/site/${encodeURIComponent(siteId.trim())}`
  } catch {
    return ''
  }
}
</script>

<script setup lang="ts">
import { buildLoginUrl } from '~/shared/auth/return-target'
import {
  normalizeApiError,
  publicApiMutation,
  publicApiRequest,
} from '~/utils/api-clients'

definePageMeta({ layout: 'standalone' })

const route = useRoute()
const token = route.params.token as string

const { isAuthenticated, sessionLoading, user } = await useAuthSession()

const loading = ref(true)
const loadError = ref<string | null>(null)
const transfer = ref<TransferInfo | null>(null)
const accepting = ref(false)
const acceptError = ref<string | null>(null)
const accepted = ref(false)
const redirectingToCheckout = ref(false)
const transferPath = computed(() => `/transfer/${encodeURIComponent(token)}`)
const emailLoginUrl = computed(() => buildLoginUrl({ redirect: transferPath.value }))
const runtimeConfig = useRuntimeConfig()
const authOperation = useAuthOperation()
const authLoading = authOperation.loading
const selectedInterval = ref<'month' | 'year'>('month')

const activePricing = computed(() => {
  if (!transfer.value) return null
  return selectedInterval.value === 'year' ? transfer.value.pricing_year : transfer.value.pricing_month
})

const annualSavingsPercent = computed(() => {
  const monthlyCents = transfer.value?.pricing_month?.base_cents
  const annualCents = transfer.value?.pricing_year?.base_cents
  if (!monthlyCents || !annualCents) return null

  const savings = Math.round((1 - annualCents / (monthlyCents * 12)) * 100)
  return savings > 0 ? savings : null
})

const emailMatches = computed(() => {
  if (!transfer.value || !user.value) return false
  return user.value.email?.toLowerCase() === transfer.value.to_email.toLowerCase()
})

const iframeUrl = computed(() => {
  return buildTransferPreviewUrl(transfer.value?.site_id, runtimeConfig.public)
})

const { plans } = usePlans()
const matchedPlan = computed(() => {
  if (!transfer.value?.invited_plan || !plans.value) return null
  return plans.value.find(p => p.id === transfer.value?.invited_plan) || null
})

onMounted(async () => {
  try {
    const data = await publicApiRequest<TransferInfo>(`/api/site-transfer/${encodeURIComponent(token)}`, {
      validate: isTransferInfoResponse,
    })
    transfer.value = data
    selectedInterval.value = data.invited_interval ?? 'month'
  } catch (err: unknown) {
    loadError.value = normalizeApiError(err, 'This transfer link is invalid or unavailable.').message
  } finally {
    loading.value = false
  }
})

async function acceptTransfer() {
  accepting.value = true
  acceptError.value = null
  try {
    const result = await publicApiMutation<AcceptTransferResponse>(`/api/site-transfer/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: { interval: selectedInterval.value },
      validate: isAcceptTransferResponse,
    })
    if (result.checkout_url) {
      redirectingToCheckout.value = true
      await navigateTo(result.checkout_url, { external: true })
    } else {
      accepted.value = true
    }
  } catch (err: unknown) {
    acceptError.value = normalizeApiError(err, 'Failed to accept the transfer. Please try again.').message
  } finally {
    accepting.value = false
  }
}

async function signInWithGoogle() {
  await authOperation.signInWithGoogle(transferPath.value)
}

async function switchAccount() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signOut()
}
</script>
