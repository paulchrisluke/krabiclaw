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
          <p class="mt-4 text-base text-muted">Created by <strong class="text-default">{{ transfer.initiated_by_name }}</strong> • This handoff stays active until it is completed or cancelled.</p>

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
                  <span class="ml-1 text-[10px] font-bold text-primary uppercase tracking-wide">Save 10%</span>
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
              <PlatformButton block size="xl" class="rounded-[10px] shadow-sm hover:opacity-90" @click="signInWithGoogle">
                Continue with Google
              </PlatformButton>
              <PlatformButton block variant="outline" size="xl" class="rounded-[10px]" :to="`/login?next=/transfer/${token}`">
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

<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const token = route.params.token as string

const { isAuthenticated, sessionLoading, user } = useAuth()

interface PricingInfo {
  base_cents: number
  discounted_cents: number | null
  coupon_duration: string | null
  coupon_duration_months: number | null
}

interface TransferInfo {
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
  initiated_by_name: string
  initiated_by_domain: string
}

const loading = ref(true)
const loadError = ref<string | null>(null)
const transfer = ref<TransferInfo | null>(null)
const accepting = ref(false)
const acceptError = ref<string | null>(null)
const accepted = ref(false)
const redirectingToCheckout = ref(false)
const selectedInterval = ref<'month' | 'year'>('month')

const activePricing = computed(() => {
  if (!transfer.value) return null
  return selectedInterval.value === 'year' ? transfer.value.pricing_year : transfer.value.pricing_month
})

const emailMatches = computed(() => {
  if (!transfer.value || !user.value) return false
  return user.value.email?.toLowerCase() === transfer.value.to_email.toLowerCase()
})

const iframeUrl = computed(() => {
  if (!transfer.value?.site_subdomain) return ''
  return `https://${transfer.value.site_subdomain}.krabiclaw.com`
})

const { plans } = usePlans()
const matchedPlan = computed(() => {
  if (!transfer.value?.invited_plan || !plans.value) return null
  return plans.value.find(p => p.id === transfer.value?.invited_plan) || null
})

onMounted(async () => {
  try {
    const data = await $fetch<TransferInfo>(`/api/site-transfer/${token}`)
    transfer.value = data
    selectedInterval.value = data.invited_interval ?? 'month'
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const errorMessage = err && typeof err === 'object' && 'message' in err ? (err as Record<string, string>).message : null
    loadError.value = errorData?.error ?? errorMessage ?? 'This transfer link is invalid or unavailable.'
  } finally {
    loading.value = false
  }
})

async function acceptTransfer() {
  accepting.value = true
  acceptError.value = null
  try {
    const result = await $fetch<{ success: boolean; site_id: string; checkout_url?: string | null }>(`/api/site-transfer/${token}/accept`, {
      method: 'POST',
      body: { interval: selectedInterval.value },
    })
    if (result.checkout_url) {
      redirectingToCheckout.value = true
      await navigateTo(result.checkout_url, { external: true })
    } else {
      accepted.value = true
    }
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    acceptError.value = errorData?.error ?? 'Failed to accept the transfer. Please try again.'
  } finally {
    accepting.value = false
  }
}

async function signInWithGoogle() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: `/transfer/${token}`,
  })
}

async function switchAccount() {
  const { authClient } = await import('~/lib/auth-client')
  await authClient.signOut()
}
</script>
