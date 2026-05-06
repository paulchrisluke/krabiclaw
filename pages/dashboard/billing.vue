<template>
  <div class="min-h-screen bg-stone-50">
    <!-- Dashboard Header -->
    <UHeader>
      <template #left>
        <div class="flex items-center">
          <UButton
            to="/dashboard"
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-heroicons-arrow-left"
            class="mr-4"
          >
            Dashboard
          </UButton>
          <h1 class="text-xl font-semibold text-stone-900">
            Billing & Plans
          </h1>
        </div>
      </template>
      <template #right>
        <div class="flex items-center space-x-4">
          <span class="text-sm text-stone-600">
            {{ user?.email }}
          </span>
          <UDropdownMenu :items="userMenuItems">
            <UButton variant="ghost" color="neutral" size="sm">
              <Icon name="i-heroicons-user-circle" class="w-5 h-5" />
            </UButton>
          </UDropdownMenu>
        </div>
      </template>
    </UHeader>

    <!-- Main Content -->
    <UContainer class="py-8">
      <!-- Loading State -->
      <div v-if="loading" class="text-center py-12">
        <USkeleton class="h-8 w-8 mx-auto mb-4" />
        <p class="text-stone-600">Loading billing information...</p>
      </div>

      <!-- Billing Content -->
      <div v-else-if="billing" class="space-y-8">
        <!-- Current Plan -->
        <UCard>
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Current Plan</h2>
          
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center space-x-3">
                <h3 class="text-2xl font-bold text-stone-900 capitalize">
                  {{ billing.plan }}
                </h3>
                <UBadge :color="billing.subscriptionStatus === 'active' ? 'success' : billing.subscriptionStatus === 'trialing' ? 'info' : 'neutral'" variant="soft">
                  {{ getStatusText(billing.subscriptionStatus) }}
                </UBadge>
              </div>
              <p class="text-stone-600 mt-1">
                {{ billing.plan === 'free' ? 'Forever free plan' : 'Billed monthly' }}
              </p>
              <p v-if="billing.cancelsAtPeriodEnd" class="text-amber-600 text-sm mt-1">
                Cancels at period end
              </p>
            </div>

            <div class="text-right">
              <div v-if="billing.plan === 'free'" class="text-3xl font-bold text-stone-900">
                Free
              </div>
              <div v-else class="text-3xl font-bold text-stone-900">
                {{ getPlanPrice(billing.plan) }}
                <span class="text-lg font-normal text-stone-600">/month</span>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Plan Features -->
        <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Plan Features</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Free Plan -->
            <div
              :class="[
                'rounded-lg border p-6',
                billing.plan === 'free' ? 'border-stone-900 bg-stone-50' : 'border-stone-200'
              ]"
            >
              <h3 class="text-lg font-semibold text-stone-900 mb-2">Free</h3>
              <div class="text-2xl font-bold text-stone-900 mb-4">$0<span class="text-lg font-normal text-stone-600">/month</span></div>
              
              <ul class="space-y-2 text-sm">
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  1 restaurant website
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  {{ billing.entitlements.max_menu_items }} menu items
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Saya theme
                </li>
                <li class="flex items-center text-stone-400">
                  <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                  </svg>
                  Custom domains
                </li>
                <li class="flex items-center text-stone-400">
                  <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                  </svg>
                  Google Business integration
                </li>
              </ul>
            </div>

            <!-- Pro Plan -->
            <div
              :class="[
                'rounded-lg border p-6',
                billing.plan === 'pro' ? 'border-stone-900 bg-stone-50' : 'border-stone-200'
              ]"
            >
              <h3 class="text-lg font-semibold text-stone-900 mb-2">Pro</h3>
              <div class="text-2xl font-bold text-stone-900 mb-4">$29<span class="text-lg font-normal text-stone-600">/month</span></div>
              
              <ul class="space-y-2 text-sm">
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Everything in Free
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Custom domains
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Google Business integration
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Advanced SEO
                </li>
                <li class="flex items-center text-stone-400">
                  <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                  </svg>
                  Remove branding
                </li>
              </ul>

              <button
                v-if="billing.plan !== 'pro'"
                @click="upgradeToPlan('pro')"
                :disabled="upgrading || !billing.stripeCustomerId"
                class="mt-4 w-full bg-stone-900 text-white py-2 rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ upgrading ? 'Upgrading...' : (billing.stripeCustomerId ? 'Upgrade to Pro' : 'Unavailable in Development') }}
              </button>
            </div>

            <!-- Business Plan -->
            <div
              :class="[
                'rounded-lg border p-6',
                billing.plan === 'business' ? 'border-stone-900 bg-stone-50' : 'border-stone-200'
              ]"
            >
              <h3 class="text-lg font-semibold text-stone-900 mb-2">Business</h3>
              <div class="text-2xl font-bold text-stone-900 mb-4">$99<span class="text-lg font-normal text-stone-600">/month</span></div>
              
              <ul class="space-y-2 text-sm">
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Everything in Pro
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Remove KrabiClaw branding
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Up to 10 restaurant sites
                </li>
                <li class="flex items-center">
                  <svg class="w-4 h-4 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                  </svg>
                  Priority support
                </li>
              </ul>

              <button
                v-if="billing.plan !== 'business'"
                @click="upgradeToPlan('business')"
                :disabled="upgrading || !billing.stripeCustomerId"
                class="mt-4 w-full bg-stone-900 text-white py-2 rounded-lg hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ upgrading ? 'Upgrading...' : (billing.stripeCustomerId ? 'Upgrade to Business' : 'Unavailable in Development') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Billing Actions -->
        <div v-if="billing.plan !== 'free'" class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
          <h2 class="text-lg font-semibold text-stone-900 mb-4">Billing Management</h2>
          
          <div class="space-y-4">
            <button
              @click="openBillingPortal"
              :disabled="portalLoading"
              class="w-full border border-stone-300 text-stone-700 py-2 rounded-lg hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ portalLoading ? 'Opening...' : 'Manage Subscription' }}
            </button>
            
            <div class="text-xs text-stone-500 text-center">
              Update payment method, view invoices, or cancel subscription
            </div>
          </div>
        </div>

        <!-- Success/Error Messages -->
        <div v-if="successMessage" class="bg-green-50 border border-green-200 rounded-lg p-4">
          <p class="text-green-800">{{ successMessage }}</p>
        </div>
        
        <div v-if="errorMessage" class="bg-red-50 border border-red-200 rounded-lg p-4">
          <p class="text-red-800">{{ errorMessage }}</p>
        </div>
      </div>
    </UContainer>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'dashboard',
  auth: true
})

const { data: sessionData, isPending: sessionLoading } = useAuth()
const user = computed(() => sessionData.value?.user)

// State
const dataLoading = ref(true)
const billing = ref(null)
const upgrading = ref(false)
const portalLoading = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// Computed
const loading = computed(() => sessionLoading.value || dataLoading.value)

const userMenuItems = computed(() => [
  [{
    label: 'Profile',
    icon: 'i-heroicons-user',
    onSelect: () => navigateTo('/dashboard/profile')
  }],
  [{
    label: 'Sign Out',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    color: 'error',
    onSelect: handleSignOut
  }]
])

// Load billing data
async function loadBillingData() {
  try {
    if (!user.value && !sessionLoading.value) {
      await navigateTo('/login')
      return
    }

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
        organizationId: billing.value.organizationId || '', // Will be determined by API
        plan
      }
    })
    
    if (response.checkoutUrl) {
      // Redirect to Stripe checkout
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
        organizationId: billing.value.organizationId || '' // Will be determined by API
      }
    })
    
    if (response.portalUrl) {
      // Redirect to Stripe billing portal
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
    navigateTo('/login')
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
