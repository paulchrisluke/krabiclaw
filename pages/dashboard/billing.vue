<template>
  <UPage>
    <UPageHeader
      title="Billing"
      description="Manage the organization plan, limits, and Stripe subscription."
    />

    <UPageBody>
      <div v-if="loading" class="space-y-6">
        <USkeleton class="h-28 w-full" />
        <div class="grid gap-4 lg:grid-cols-3">
          <USkeleton class="h-64" />
          <USkeleton class="h-64" />
          <USkeleton class="h-64" />
        </div>
      </div>

      <div v-else class="space-y-6">
        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          :description="errorMessage"
        />



        <UCard v-if="billing">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm text-muted">Current plan</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <h2 class="text-3xl font-semibold capitalize text-highlighted">{{ billing.plan }}</h2>
                <UBadge :color="billing.plan === 'free' ? 'neutral' : 'success'" variant="soft">
                  {{ billing.subscriptionStatus || 'active' }}
                </UBadge>
              </div>
              <p v-if="billing.currentPeriodEnd" class="mt-2 text-sm text-muted">
                Renews {{ formatDate(billing.currentPeriodEnd) }}
              </p>
            </div>

            <UButton
              v-if="billing.plan !== 'free'"
              :loading="portalLoading"
              icon="i-heroicons-credit-card"
              @click="openBillingPortal"
            >
              Manage Subscription
            </UButton>
          </div>
        </UCard>

        <!-- AI Credits -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bot" class="size-4 text-primary" />
                <h2 class="font-semibold">AI Credits</h2>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="credits" class="text-sm text-muted">
                  {{ credits.lifetime_used.toLocaleString() }} used · {{ credits.balance.toLocaleString() }} remaining
                </span>
                <UDropdownMenu :items="creditBundles" :content="{ align: 'end' }">
                  <UButton size="xs" color="primary" variant="soft" icon="i-heroicons-credit-card" trailing-icon="i-heroicons-chevron-down" :loading="buyingCredits !== null">
                    Buy credits
                  </UButton>
                </UDropdownMenu>
              </div>
            </div>
          </template>

          <USkeleton v-if="creditsLoading" class="h-32 w-full" />

          <div v-else-if="credits" class="space-y-4">
            <div>
              <div class="mb-1 flex items-center justify-between text-xs text-muted">
                <span>{{ credits.lifetime_used.toLocaleString() }} used</span>
                <span>{{ (credits.balance + credits.lifetime_used).toLocaleString() }} total granted</span>
              </div>
              <UProgress
                :model-value="credits.lifetime_used"
                :max="credits.balance + credits.lifetime_used || 1"
                :color="credits.balance < 50 ? 'error' : credits.balance < 200 ? 'warning' : 'primary'"
              />
            </div>

            <div v-if="credits.by_action?.length" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div v-for="row in credits.by_action" :key="row.action" class="rounded-lg bg-elevated px-3 py-2">
                <p class="text-xs text-muted capitalize">{{ String(row.action).replace(/_/g, ' ') }}</p>
                <p class="mt-0.5 text-lg font-semibold tabular-nums">{{ Number(row.total_credits).toLocaleString() }}</p>
                <p class="text-xs text-muted">{{ row.calls }} call{{ Number(row.calls) === 1 ? '' : 's' }}</p>
              </div>
            </div>

            <div v-if="credits.usage?.length">
              <h3 class="mb-2 text-sm font-medium">Recent usage</h3>
              <div class="overflow-x-auto rounded-lg border border-default">
                <table class="w-full text-sm">
                  <thead class="bg-elevated">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">Action</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">Site</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">In</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">Out</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">Credits</th>
                      <th class="px-3 py-2 text-right text-xs font-medium text-muted">When</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr v-for="(row, i) in credits.usage" :key="i" class="hover:bg-elevated/50">
                      <td class="px-3 py-2 capitalize">{{ String(row.action).replace(/_/g, ' ') }}</td>
                      <td class="px-3 py-2 text-muted">{{ row.site_name || '—' }}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-muted">{{ Number(row.input_tokens).toLocaleString() }}</td>
                      <td class="px-3 py-2 text-right tabular-nums text-muted">{{ Number(row.output_tokens).toLocaleString() }}</td>
                      <td class="px-3 py-2 text-right font-medium tabular-nums">{{ row.credits_charged }}</td>
                      <td class="px-3 py-2 text-right text-muted">{{ formatRelative(String(row.created_at)) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p v-else class="text-sm text-muted">No AI usage yet.</p>
          </div>

          <div v-else class="rounded-lg border border-dashed border-default bg-elevated p-5">
            <p class="text-sm text-muted">No AI credit activity yet.</p>
            <p class="mt-1 text-xs text-muted">Usage appears here after your first AI action.</p>
          </div>
        </UCard>

        <!-- Billing interval toggle -->
        <div class="flex items-center gap-3">
          <span class="text-sm" :class="!annual ? 'font-semibold text-default' : 'text-muted'">Monthly</span>
          <button
            type="button"
            class="relative w-10 h-5 rounded-full transition-colors"
            :class="annual ? 'bg-(--kc-teal)' : 'bg-muted'"
            role="switch"
            :aria-checked="annual"
            aria-label="Toggle annual billing"
            @click="annual = !annual"
          >
            <span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform" :class="{ 'translate-x-5': annual }" />
          </button>
          <span class="text-sm" :class="annual ? 'font-semibold text-default' : 'text-muted'">
            Annual <span class="text-xs text-emerald-600 ml-1">Save ~30%</span>
          </span>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <UCard
            v-for="plan in plans"
            :key="plan.id"
            :class="billing?.plan === plan.id ? 'ring-2 ring-primary' : ''"
          >
            <div class="flex h-full flex-col">
              <div>
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-lg font-semibold text-highlighted">{{ plan.name }}</h2>
                  <div class="flex gap-2">
                    <UBadge v-if="plan.badge && billing?.plan !== plan.id" color="primary" variant="soft">{{ plan.badge }}</UBadge>
                    <UBadge v-if="billing?.plan === plan.id" color="success" variant="soft">Current</UBadge>
                  </div>
                </div>
                <p class="mt-2 text-3xl font-semibold text-highlighted">
                  {{ displayPrice(plan, annual) }}
                  <span v-if="plan.prices?.length" class="text-sm font-normal text-muted">
                    {{ annual && plan.id === 'agency' ? '/yr' : annual ? '/location/yr' : plan.id === 'agency' ? '/mo' : '/location/mo' }}
                  </span>
                </p>
              </div>

              <ul class="mt-5 flex-1 space-y-2 text-sm text-default">
                <li v-for="feature in plan.features" :key="feature" class="flex gap-2">
                  <UIcon name="i-heroicons-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{{ feature }}</span>
                </li>
              </ul>

              <template v-if="billing?.plan !== plan.id">
                <UButton
                  v-if="plan.id === 'free'"
                  color="neutral"
                  variant="soft"
                  block
                  class="mt-6"
                  @click="upgradeToPlan(plan.id)"
                >
                  Switch to Free
                </UButton>
                <UButton
                  v-else
                  :loading="upgrading === plan.id"
                  color="primary"
                  block
                  class="mt-6"
                  @click="upgradeToPlan(plan.id)"
                >
                  Upgrade to {{ plan.name }}
                </UButton>
              </template>
            </div>
          </UCard>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">

import { useToast } from '~/composables/useToast'
const { addToast } = useToast()

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const loading = ref(true)
const billing = ref<any>(null)
const credits = ref<any>(null)
const creditsLoading = ref(true)
const upgrading = ref<string | null>(null)
const portalLoading = ref(false)
const addingCredits = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const annual = ref(false)
const isDev = useRequestURL().hostname === 'localhost'
const buyingCredits = ref<number | null>(null)

async function purchaseCredits(bundle: 500 | 2500 | 5000) {
  buyingCredits.value = bundle
  errorMessage.value = ''
  try {
    const res = await $fetch<{ checkoutUrl?: string; balance?: number; error?: string }>('/api/billing/credits/add', {
      method: 'POST',
      body: { bundle }
    })
    if (res.checkoutUrl) {
      await navigateTo(res.checkoutUrl, { external: true })
    } else if (res.balance !== undefined) {
      // dev mode direct top-up response
      successMessage.value = `Added ${bundle} credits. New balance: ${res.balance}`
      addToast(successMessage.value, 'success')
      await loadCredits()
    } else {
      errorMessage.value = res.error ?? 'Failed to start checkout'
    }
  } catch (err: any) {
    errorMessage.value = err?.data?.error ?? err?.message ?? 'Failed to start checkout'
  } finally {
    buyingCredits.value = null
  }
}

const creditBundles = [
  [
    { label: '500 credits — $9', icon: 'i-heroicons-bolt', onSelect: () => { purchaseCredits(500) } },
    { label: '2,500 credits — $29', icon: 'i-heroicons-bolt', onSelect: () => { purchaseCredits(2500) } },
    { label: '5,000 credits — $49', icon: 'i-heroicons-bolt', onSelect: () => { purchaseCredits(5000) } },
  ]
]

const { plans, displayPrice } = usePlans()

const loadCredits = async () => {
  creditsLoading.value = true
  try {
    credits.value = await $fetch<any>('/api/billing/credits')
  } catch {
    // non-critical
    credits.value = null
  } finally {
    creditsLoading.value = false
  }
}

const addDevCredits = async (amount: number) => {
  addingCredits.value = true
  try {
    const res = await $fetch<{ balance: number }>('/api/billing/credits/add', { method: 'POST', body: { amount } })
    successMessage.value = `Added ${amount} dev credits. New balance: ${res.balance}`
    addToast(successMessage.value, 'success')
    await loadCredits()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to add credits'
  } finally {
    addingCredits.value = false
  }
}

const formatRelative = (iso: string) => {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  } catch { return '—' }
}

const loadBillingData = async () => {
  loading.value = true
  try {
    const response = await $fetch<any>('/api/billing/status')
    billing.value = response.billing
  } catch (err) {
    console.error('Failed to load billing data:', err)
    billing.value = null
  } finally {
    loading.value = false
  }
}

const upgradeToPlan = async (plan: string) => {
  errorMessage.value = ''
  upgrading.value = plan
  try {
    const response = await $fetch<{ checkoutUrl: string }>('/api/billing/checkout', {
      method: 'POST',
      body: { plan, interval: annual.value ? 'year' : 'month' }
    })
    if (response?.checkoutUrl) {
      await navigateTo(response.checkoutUrl, { external: true })
    } else {
      errorMessage.value = 'Failed to create checkout session'
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to create checkout session'
  } finally {
    upgrading.value = null
  }
}

const openBillingPortal = async () => {
  portalLoading.value = true
  errorMessage.value = ''
  try {
    const orgId = billing.value?.organizationId ?? ''
    if (!orgId) {
      errorMessage.value = 'Organization ID not found'
      return
    }
    const response = await $fetch<{ portalUrl: string }>('/api/billing/portal', {
      method: 'POST',
      body: { organizationId: orgId }
    })
    if (response?.portalUrl) {
      await navigateTo(response.portalUrl, { external: true })
    } else {
      errorMessage.value = 'Failed to open billing portal'
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to open billing portal'
  } finally {
    portalLoading.value = false
  }
}

const formatDate = (dateString: string) => {
  try {
    const date = new Date(dateString)
    if (isNaN(date.getTime()) || date.toString() === 'Invalid Date') return '-'
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return '-'
  }
}

onMounted(async () => {
  if (route.query.success === 'true') {
    addToast('Payment successful. Your plan has been updated.', 'success')
    // Remove the query param from the URL
    if (window && window.history && window.location) {
      const url = new URL(window.location.href)
      url.searchParams.delete('success')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }
  if (route.query.canceled === 'true') errorMessage.value = 'Payment was canceled. Your plan was not changed.'
  
  // Auto-start checkout if plan query param exists
  const { isAuthenticated } = useAuth()
  await Promise.all([loadBillingData(), loadCredits()])
  
  if (isAuthenticated.value && route.query.plan) {
    const raw = route.query.plan
    const planId = Array.isArray(raw) ? raw[0] : String(raw)
    // Remove the plan query param from URL
    if (window && window.history && window.location) {
      const url = new URL(window.location.href)
      url.searchParams.delete('plan')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
    if (planId) await upgradeToPlan(planId)
  }
})

useSeoMeta({ title: 'Billing | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
