<template>
  <div class="min-h-screen bg-(--ui-bg-muted)">
    <div class="container mx-auto px-4 py-16">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-4xl font-bold text-(--ui-text-highlighted) mb-8">Billing & Plans</h1>
        
        <div class="bg-(--ui-bg) rounded-2xl shadow-sm border border-(--ui-border) p-8">
          <h2 class="text-2xl font-semibold text-(--ui-text-highlighted) mb-6">Choose Your Plan</h2>
          
          <div class="grid md:grid-cols-2 gap-8 overflow-visible">
            <!-- Free Plan -->
            <div class="border border-(--ui-border) rounded-xl p-6">
              <h3 class="text-xl font-bold text-(--ui-text-highlighted) mb-2">Free</h3>
              <p class="text-3xl font-bold text-(--ui-text-highlighted) mb-4">$0<span class="text-lg font-normal text-(--ui-text-muted)">/month</span></p>
              <ul class="space-y-2 text-(--ui-text-muted) mb-6">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Subdomain site
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Saya theme
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Manual editor
                </li>
              </ul>
              <UButton
                variant="outline"
                size="xl"
                class="w-full"
                :disabled="isCurrentPlan('free')"
                @click="() => selectPlan('free')"
              >
                {{ isCurrentPlan('free') ? 'Current Plan' : 'Choose' }}
              </UButton>
            </div>
            
            <!-- Pro Plan -->
            <div class="border-2 border-black rounded-xl p-6 relative">
              <div class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <span class="bg-black text-white px-3 py-1 text-sm font-medium rounded-full">Popular</span>
              </div>
              <h3 class="text-xl font-bold text-(--ui-text-highlighted) mb-2">Pro</h3>
              <p class="text-3xl font-bold text-(--ui-text-highlighted) mb-4">$25<span class="text-lg font-normal text-(--ui-text-muted)">/month</span></p>
              <ul class="space-y-2 text-(--ui-text-muted) mb-6">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Custom domain
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  SSL certificate
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Google Business sync
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Priority support
                </li>
              </ul>
              <UButton
                color="primary"
                size="xl"
                class="w-full"
                :disabled="isCurrentPlan('pro')"
                @click="() => selectPlan('pro')"
              >
                {{ isCurrentPlan('pro') ? 'Current Plan' : 'Upgrade to Pro' }}
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const currentPlan = ref('free')
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await $fetch<{ billing?: { plan?: string } }>('/api/billing/status')
    currentPlan.value = res.billing?.plan || 'free'
  } catch (error) {
    console.error('Failed to fetch plan:', error)
  } finally {
    loading.value = false
  }
})

function isCurrentPlan(plan: string) {
  return currentPlan.value === plan
}

async function selectPlan(plan: string) {
  try {
    const res = await $fetch<{ checkoutUrl?: string }>('/api/billing/checkout', {
      method: 'POST',
      body: { plan }
    })
    if (res.checkoutUrl) {
      window.location.href = res.checkoutUrl
    }
  } catch (error: any) {
    alert(error.data?.message || 'Failed to initiate checkout')
  }
}

useSeoMeta({
  title: 'Billing & Plans | KrabiClaw',
  description: 'Choose the perfect plan for your restaurant website needs.'
})
</script>
