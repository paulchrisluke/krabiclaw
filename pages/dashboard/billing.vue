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

        <UAlert
          v-if="successMessage"
          color="success"
          variant="soft"
          icon="i-heroicons-check-circle"
          :description="successMessage"
        />

        <UCard v-if="billing">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm text-(--ui-text-muted)">Current plan</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <h2 class="text-3xl font-semibold capitalize text-(--ui-text-highlighted)">{{ billing.plan }}</h2>
                <UBadge :color="billing.plan === 'free' ? 'neutral' : 'success'" variant="soft">
                  {{ billing.subscriptionStatus || 'active' }}
                </UBadge>
              </div>
              <p v-if="billing.currentPeriodEnd" class="mt-2 text-sm text-(--ui-text-muted)">
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
                <UButton
                  v-if="isDev"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-heroicons-plus"
                  :loading="addingCredits"
                  @click="addDevCredits(500)"
                >
                  + 500 dev credits
                </UButton>
                <UButton v-else size="xs" color="primary" variant="soft" icon="i-heroicons-credit-card">
                  Buy credits
                </UButton>
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
                :value="credits.lifetime_used"
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

        <div class="grid gap-4 lg:grid-cols-3">
          <UCard
            v-for="plan in plans"
            :key="plan.id"
            :variant="billing?.plan === plan.id ? 'solid' : 'outline'"
          >
            <div class="flex h-full flex-col">
              <div>
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-lg font-semibold text-(--ui-text-highlighted)">{{ plan.name }}</h2>
                  <UBadge v-if="billing?.plan === plan.id" color="primary" variant="soft">Current</UBadge>
                </div>
                <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">
                  {{ plan.price }}
                  <span v-if="plan.id !== 'free'" class="text-sm font-normal text-(--ui-text-muted)">/mo</span>
                </p>
              </div>

              <ul class="mt-5 flex-1 space-y-2 text-sm text-(--ui-text)">
                <li v-for="feature in plan.features" :key="feature" class="flex gap-2">
                  <UIcon name="i-heroicons-check-circle" class="mt-0.5 size-4 shrink-0 text-(--ui-primary)" />
                  <span>{{ feature }}</span>
                </li>
              </ul>

              <UButton
                v-if="billing?.plan !== plan.id"
                :disabled="plan.id === 'free'"
                :loading="upgrading === plan.id"
                color="neutral"
                variant="soft"
                block
                class="mt-6"
                @click="upgradeToPlan(plan.id)"
              >
                {{ plan.id === 'free' ? 'Included' : `Upgrade to ${plan.name}` }}
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
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
const isDev = useRequestURL().hostname === 'localhost'

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    features: ['1 website', 'Manual editor', 'Saya theme', 'KrabiClaw subdomain']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    features: ['Custom domain', 'Google Business integration', 'Advanced SEO', 'Higher menu limits']
  },
  {
    id: 'business',
    name: 'Business',
    price: '$99',
    features: ['Multiple websites', 'More locations', 'Priority support', 'Remove KrabiClaw branding']
  }
]

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
    const res = await $fetch<any>('/api/billing/credits/add', { method: 'POST', body: { amount } } as any)
    successMessage.value = `Added ${amount} dev credits. New balance: ${res.balance}`
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
  upgrading.value = plan
  errorMessage.value = ''
  try {
    if (!billing.value) {
      errorMessage.value = 'Billing data not loaded'
      return
    }
    const orgId = billing.value.organizationId || ''
    if (!orgId) {
      errorMessage.value = 'Organization ID not found'
      return
    }
    const response = await $fetch<any>('/api/billing/checkout', {
      method: 'POST',
      body: { organizationId: orgId, plan }
    } as any)
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
    const response = await $fetch<any>('/api/billing/portal', {
      method: 'POST',
      body: { organizationId: orgId }
    } as any)
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
  if (route.query.success === 'true') successMessage.value = 'Payment successful. Your plan has been updated.'
  if (route.query.canceled === 'true') errorMessage.value = 'Payment was canceled. Your plan was not changed.'
  await Promise.all([loadBillingData(), loadCredits()])
})

useSeoMeta({ title: 'Billing | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
