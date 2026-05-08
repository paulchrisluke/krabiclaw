<template>
  <div class="min-h-screen bg-(--ui-bg-muted) ">
    <!-- Main Content -->
    <UContainer class="py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <USkeleton class="h-8 w-8 mx-auto mb-4" />
        <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">Loading billing information...</p>
      </div>

      <!-- Billing Content -->
      <div v-else-if="billing" class="space-y-6">
        <!-- Current Plan Card -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-(--ui-text-highlighted)  mb-2">Current Plan</h2>
              <div class="flex items-center space-x-2">
                <UBadge :color="billing.plan === 'free' ? 'neutral' : 'success'" variant="soft">
                  {{ billing.plan.charAt(0).toUpperCase() + billing.plan.slice(1) }}
                </UBadge>
                <UBadge v-if="billing.subscriptionStatus" color="info" variant="soft">
                  {{ getStatusText(billing.subscriptionStatus) }}
                </UBadge>
              </div>
              <p v-if="billing.currentPeriodEnd" class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mt-1">
                Next billing date: {{ formatDate(billing.currentPeriodEnd) }}
              </p>
            </div>

            <div class="text-right">
              <div v-if="billing.plan === 'free'" class="text-3xl font-bold text-(--ui-text-highlighted) ">
                Free
              </div>
              <div v-else class="text-3xl font-bold text-(--ui-text-highlighted) ">
                {{ getPlanPrice(billing.plan) }}
                <span class="text-lg font-normal text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">/month</span>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Plan Features -->
        <div class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6">
          <h2 class="text-lg font-semibold text-(--ui-text-highlighted)  mb-4">Plan Features</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Free Plan -->
            <div
              :class="[
                'rounded-lg border p-6',
                billing.plan === 'free' ? 'border-gray-900 dark:border-(--ui-border-muted) bg-(--ui-bg-muted) ' : 'border-(--ui-border) dark:border-gray-700'
              ]"
            >
              <h3 class="text-lg font-semibold text-(--ui-text-highlighted)  mb-2">Free</h3>
              <div class="text-2xl font-bold text-(--ui-text-highlighted)  mb-4">$0<span class="text-lg font-normal text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">/month</span></div>
              
              <ul class="space-y-2 text-sm">
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  1 restaurant website
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  {{ billing.entitlements?.max_menu_items || 50 }} menu items
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Saya theme
                </li>
                <li class="flex items-center text-stone-400">
                  <Icon name="i-heroicons-x-circle" class="w-4 h-4 mr-2" />
                  Custom domains
                </li>
                <li class="flex items-center text-stone-400">
                  <Icon name="i-heroicons-x-circle" class="w-4 h-4 mr-2" />
                  Google Business integration
                </li>
              </ul>
            </div>

            <!-- Pro Plan -->
            <div
              :class="[
                'rounded-lg border p-6',
                billing.plan === 'pro' ? 'border-gray-900 dark:border-(--ui-border-muted) bg-(--ui-bg-muted) ' : 'border-(--ui-border) dark:border-gray-700'
              ]"
            >
              <h3 class="text-lg font-semibold text-(--ui-text-highlighted)  mb-2">Pro</h3>
              <div class="text-2xl font-bold text-(--ui-text-highlighted)  mb-4">$29<span class="text-lg font-normal text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">/month</span></div>
              
              <ul class="space-y-2 text-sm">
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Everything in Free
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Custom domains
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Google Business integration
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Advanced SEO
                </li>
                <li class="flex items-center text-stone-400">
                  <Icon name="i-heroicons-x-circle" class="w-4 h-4 mr-2" />
                  Remove branding
                </li>
              </ul>

              <UButton
                v-if="billing.plan !== 'pro'"
                @click="upgradeToPlan('pro')"
                :disabled="upgrading || !billing.stripeCustomerId"
                class="mt-4 w-full"
                size="sm"
              >
                {{ upgrading ? 'Upgrading...' : (billing.stripeCustomerId ? 'Upgrade to Pro' : 'Unavailable in Development') }}
              </UButton>
            </div>

            <!-- Business Plan -->
            <div
              :class="[
                'rounded-lg border p-6',
                billing.plan === 'business' ? 'border-gray-900 dark:border-(--ui-border-muted) bg-(--ui-bg-muted) ' : 'border-(--ui-border) dark:border-gray-700'
              ]"
            >
              <h3 class="text-lg font-semibold text-(--ui-text-highlighted)  mb-2">Business</h3>
              <div class="text-2xl font-bold text-(--ui-text-highlighted)  mb-4">$99<span class="text-lg font-normal text-(--ui-text-muted) dark:text-(--ui-text-dimmed)">/month</span></div>
              
              <ul class="space-y-2 text-sm">
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Everything in Pro
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Remove KrabiClaw branding
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Up to 10 restaurant sites
                </li>
                <li class="flex items-center">
                  <Icon name="i-heroicons-check-circle" class="w-4 h-4 text-green-500 mr-2" />
                  Priority support
                </li>
              </ul>

              <UButton
                v-if="billing.plan !== 'business'"
                @click="upgradeToPlan('business')"
                :disabled="upgrading || !billing.stripeCustomerId"
                class="mt-4 w-full"
                size="sm"
              >
                {{ upgrading ? 'Upgrading...' : (billing.stripeCustomerId ? 'Upgrade to Business' : 'Unavailable in Development') }}
              </UButton>
            </div>
          </div>
        </div>

        <!-- Billing Actions -->
        <div v-if="billing.plan !== 'free'" class="bg-(--ui-bg)  rounded-lg shadow-sm border border-(--ui-border) dark:border-gray-700 p-6">
          <h2 class="text-lg font-semibold text-(--ui-text-highlighted)  mb-4">Billing Management</h2>
          
          <div class="space-y-4">
            <UButton
              @click="openBillingPortal"
              :disabled="portalLoading"
              variant="outline"
              class="w-full"
              size="sm"
            >
              {{ portalLoading ? 'Opening...' : 'Manage Subscription' }}
            </UButton>
            
            <div class="text-xs text-(--ui-text-muted) dark:text-(--ui-text-dimmed) text-center">
              Update payment method, view invoices, or cancel subscription
            </div>
          </div>
        </div>

        <!-- Success/Error Messages -->
        <UAlert v-if="successMessage" color="success" class="mb-4">
          {{ successMessage }}
        </UAlert>
        
        <UAlert v-if="errorMessage" color="error" class="mb-4">
          {{ errorMessage }}
        </UAlert>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
import { authClient } from '~/lib/auth-client'

definePageMeta({
  layout: 'dashboard'
})

// State
const dataLoading = ref(true)
const billing = ref(null)
const upgrading = ref(false)
const portalLoading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Computed
const loading = computed(() => dataLoading.value)

// Load billing data
async function loadBillingData() {
  try {
    const response = await $fetch('/api/billing/status')
    billing.value = response.billing
  } catch (error) {
    console.error('Failed to load billing data:', error)
    if (error.response?.status === 503) {
      billing.value = {
        plan: 'free',
        subscriptionStatus: 'free',
        entitlements: {
          plan: 'free',
          custom_domains: false,
          google_business: false,
          remove_branding: false,
          max_sites: 1,
          max_locations: 1,
          max_menu_items: 50,
          advanced_seo: false
        }
      }
      errorMessage.value = 'Billing not configured in development. Free plan active.'
    } else {
      errorMessage.value = 'Failed to load billing information'
    }
  } finally {
    dataLoading.value = false
  }
}

// Upgrade to specific plan
async function upgradeToPlan(plan) {
  if (upgrading.value) return
  
  upgrading.value = true
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    const response = await $fetch('/api/billing/checkout', {
      method: 'POST',
      body: {
        organizationId: billing.value.organizationId || '',
        plan
      }
    })
    
    if (response.checkoutUrl) {
      await navigateTo(response.checkoutUrl, { external: true })
    }
  } catch (error) {
    console.error('Failed to create checkout session:', error)
    errorMessage.value = 'Failed to initiate upgrade. Please try again.'
  } finally {
    upgrading.value = false
  }
}

// Open billing portal
async function openBillingPortal() {
  if (portalLoading.value) return
  
  portalLoading.value = true
  successMessage.value = ''
  errorMessage.value = ''
  
  try {
    const response = await $fetch('/api/billing/portal', {
      method: 'POST',
      body: {
        organizationId: billing.value.organizationId || ''
      }
    })
    
    if (response.portalUrl) {
      await navigateTo(response.portalUrl, { external: true })
    }
  } catch (error) {
    console.error('Failed to create portal session:', error)
    errorMessage.value = 'Failed to open billing portal. Please try again.'
  } finally {
    portalLoading.value = false
  }
}

// Helper functions
function getStatusText(status) {
  switch (status) {
    case 'active': return 'Active'
    case 'trialing': return 'Trial'
    case 'canceled': return 'Canceled'
    case 'past_due': return 'Past Due'
    default: return 'Unknown'
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function getPlanPrice(plan) {
  switch (plan) {
    case 'starter': return '$9'
    case 'pro': return '$29'
    case 'business': return '$99'
    default: return '$0'
  }
}

// Sign out handler
async function handleSignOut() {
  try {
    await authClient.signOut()
    await navigateTo('/login')
  } catch (error) {
    console.error('Sign out failed:', error)
  }
}

// Load data on mount
onMounted(() => {
  loadBillingData()
})

// Check for success/canceled URL parameters
onMounted(() => {
  const route = useRoute()
  if (route.query.success === 'true') {
    successMessage.value = 'Payment successful! Your plan has been updated.'
  } else if (route.query.canceled === 'true') {
    errorMessage.value = 'Payment was canceled. Your plan was not changed.'
  }
})
</script>
