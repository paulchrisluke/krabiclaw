<template>
  <div class="min-h-screen bg-default">

    <!-- Loading -->
    <div v-if="loading" class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-3">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-muted" />
        <p class="text-muted text-sm">Loading…</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="loadError" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <UIcon name="i-heroicons-x-circle" class="text-3xl text-red-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">Transfer unavailable</h1>
        <p class="text-muted text-sm">{{ loadError }}</p>
        <UButton to="/dashboard" variant="soft">Go to Dashboard</UButton>
      </div>
    </div>

    <!-- Redirecting to checkout -->
    <div v-else-if="redirectingToCheckout" class="min-h-screen flex items-center justify-center">
      <div class="text-center space-y-4">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin text-4xl text-muted" />
        <h1 class="text-xl font-bold text-highlighted">Transfer complete!</h1>
        <p class="text-muted text-sm">Setting up your plan…</p>
      </div>
    </div>

    <!-- Accepted -->
    <div v-else-if="accepted" class="min-h-screen flex items-center justify-center px-4">
      <div class="text-center space-y-4 max-w-sm">
        <div class="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <UIcon name="i-heroicons-check-circle" class="text-3xl text-green-500" />
        </div>
        <h1 class="text-xl font-bold text-highlighted">It's yours!</h1>
        <p class="text-muted text-sm"><strong class="text-default">{{ transfer!.site_name }}</strong> is now in your account.</p>
        <UButton to="/dashboard" color="primary">Open Dashboard</UButton>
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
          <p class="mt-4 text-base text-muted">Created by <strong class="text-default">{{ transfer.initiated_by_name }}</strong> • Link expires in {{ expiresIn }}</p>

          <!-- Personal note -->
          <p v-if="transfer.message" class="mt-5 text-sm italic text-muted border-l-2 border-default pl-3">
            "{{ transfer.message }}"
          </p>

          <!-- Details -->
          <div class="mt-6 space-y-3">
            <div v-if="transfer.invited_domain" class="flex items-start gap-3 text-sm">
              <UIcon name="i-heroicons-globe-alt" class="size-4 text-muted mt-0.5 shrink-0" />
              <span class="text-muted">Ready to launch at <strong class="text-default">{{ transfer.invited_domain }}</strong> (hosting included).</span>
            </div>

            <!-- Pricing block -->
            <div v-if="matchedPlan" class="mt-8">
              <BillingPlanCard :plan="matchedPlan" :annual="false">
                <template #cta>
                  <!-- Custom discount callout if applicable -->
                  <div v-if="transfer.pricing && transfer.pricing.discounted_cents !== null" class="mb-4 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-center">
                    <div class="flex items-baseline justify-center gap-2">
                      <span class="text-xl font-bold text-highlighted">${{ (transfer.pricing.discounted_cents / 100).toFixed(2) }}<span class="text-sm font-normal text-muted">/mo</span></span>
                      <span class="text-xs text-muted line-through">${{ (transfer.pricing.base_cents / 100).toFixed(0) }}</span>
                    </div>
                    <p class="text-[11px] text-primary mt-1 font-semibold uppercase tracking-wide">
                      <template v-if="transfer.pricing.coupon_duration === 'forever'">locked in forever</template>
                      <template v-else-if="transfer.pricing.coupon_duration === 'repeating' && transfer.pricing.coupon_duration_months">for {{ transfer.pricing.coupon_duration_months }} months</template>
                      <template v-else>first month</template>
                    </p>
                  </div>
                  <p class="text-center text-xs text-muted mt-2">
                    <template v-if="transfer.invited_domain">An active plan is required to keep your custom domain live.</template>
                    <template v-else>Subscribe when you're ready to launch.</template>
                  </p>
                </template>
              </BillingPlanCard>
            </div>

          </div><!-- /details -->

          <!-- Auth section -->
          <div class="mt-8 space-y-3">

            <!-- Not logged in -->
            <template v-if="!isAuthenticated && !sessionLoading">
              <UButton block color="primary" size="xl" class="rounded-[10px] font-semibold text-[15px] shadow-sm hover:scale-[1.01] transition-all duration-300" @click="signInWithGoogle">
                <UIcon name="i-simple-icons-google" class="mr-2" />
                Continue with Google
              </UButton>
              <UButton block variant="outline" size="xl" class="rounded-[10px] font-semibold text-[15px]" :to="`/login?next=/transfer/${token}`">
                Sign in with email
              </UButton>
              <p class="text-xs text-center text-muted">Sign in or create a free account to claim this site.</p>
            </template>

            <!-- Wrong email -->
            <template v-else-if="isAuthenticated && !emailMatches">
              <UAlert
                color="warning"
                variant="soft"
                icon="i-heroicons-exclamation-triangle"
                title="Wrong account"
                :description="`This was sent to ${transfer.to_email}. You're signed in as ${user?.email}.`"
              />
              <UButton block variant="soft" @click="switchAccount">Sign in with a different account</UButton>
            </template>

            <!-- Ready -->
            <template v-else-if="isAuthenticated">
              <UAlert
                color="success"
                variant="soft"
                icon="i-heroicons-check-badge"
                :description="`Signed in as ${user?.email}`"
              />
              <UAlert v-if="acceptError" color="error" variant="soft" :description="acceptError" />
              <UButton block color="primary" size="xl" class="rounded-[10px] font-semibold text-[15px] shadow-sm hover:scale-[1.01] transition-all duration-300" :loading="accepting" @click="acceptTransfer">
                Claim {{ transfer.site_name }}
              </UButton>
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
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3.5" />
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
                  <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-4" />
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
  expires_at: string
  message: string | null
  invited_plan: string | null
  invited_coupon: string | null
  pricing: PricingInfo | null
  invited_domain: string | null
  initiated_by_name: string
  initiated_by_domain: string
}

const PLAN_NAMES: Record<string, string> = {
  growth: 'Growth',
  managed: 'Managed',
  seo_accelerator: 'SEO Accelerator',
}

const loading = ref(true)
const loadError = ref<string | null>(null)
const transfer = ref<TransferInfo | null>(null)
const accepting = ref(false)
const acceptError = ref<string | null>(null)
const accepted = ref(false)
const redirectingToCheckout = ref(false)

const emailMatches = computed(() => {
  if (!transfer.value || !user.value) return false
  return user.value.email?.toLowerCase() === transfer.value.to_email.toLowerCase()
})

const planName = computed(() => {
  if (!transfer.value?.invited_plan) return ''
  return PLAN_NAMES[transfer.value.invited_plan] ?? transfer.value.invited_plan
})

const iframeUrl = computed(() => {
  if (!transfer.value?.site_subdomain) return ''
  return `https://${transfer.value.site_subdomain}.krabiclaw.com`
})

const expiresIn = computed(() => {
  if (!transfer.value) return ''
  const diff = new Date(transfer.value.expires_at).getTime() - Date.now()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'a few hours'
  return days === 1 ? '1 day' : `${days} days`
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
  } catch (err: unknown) {
    const errorData = err && typeof err === 'object' && 'data' in err ? (err as Record<string, { error?: string }>).data : null
    const errorMessage = err && typeof err === 'object' && 'message' in err ? (err as Record<string, string>).message : null
    loadError.value = errorData?.error ?? errorMessage ?? 'This transfer link is invalid or has expired.'
  } finally {
    loading.value = false
  }
})

async function acceptTransfer() {
  accepting.value = true
  acceptError.value = null
  try {
    const result = await $fetch<{ success: boolean; site_id: string; checkout_url?: string | null }>(`/api/site-transfer/${token}/accept`, { method: 'POST' })
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
