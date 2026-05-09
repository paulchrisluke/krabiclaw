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
const upgrading = ref<string | null>(null)
const portalLoading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

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
    const response = await $fetch<any>('/api/billing/portal', {
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
  if (route.query.success === 'true') successMessage.value = 'Payment successful. Your plan has been updated.'
  if (route.query.canceled === 'true') errorMessage.value = 'Payment was canceled. Your plan was not changed.'
  await loadBillingData()
})

useSeoMeta({ title: 'Billing | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
