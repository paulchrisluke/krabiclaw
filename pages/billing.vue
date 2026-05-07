<template>
  <div class="min-h-screen bg-stone-50">
    <div class="container mx-auto px-4 py-16">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-4xl font-bold text-stone-900 mb-8">Billing & Plans</h1>
        
        <div class="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
          <h2 class="text-2xl font-semibold text-stone-900 mb-6">Choose Your Plan</h2>
          
          <div class="grid md:grid-cols-2 gap-8">
            <!-- Free Plan -->
            <div class="border border-stone-200 rounded-xl p-6">
              <h3 class="text-xl font-bold text-stone-900 mb-2">Free</h3>
              <p class="text-3xl font-bold text-stone-900 mb-4">$0<span class="text-lg font-normal text-stone-600">/month</span></p>
              <ul class="space-y-2 text-stone-600 mb-6">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Subdomain site
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Saya theme
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Manual editor
                </li>
              </ul>
              <UButton variant="outline" color="neutral" size="lg" class="w-full">Current Plan</UButton>
            </div>
            
            <!-- Pro Plan -->
            <div class="border-2 border-black rounded-xl p-6 relative">
              <div class="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <span class="bg-black text-white px-3 py-1 text-sm font-medium rounded-full">Popular</span>
              </div>
              <h3 class="text-xl font-bold text-stone-900 mb-2">Pro</h3>
              <p class="text-3xl font-bold text-stone-900 mb-4">$25<span class="text-lg font-normal text-stone-600">/month</span></p>
              <ul class="space-y-2 text-stone-600 mb-6">
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Custom domain
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  SSL certificate
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Google Business sync
                </li>
                <li class="flex items-center">
                  <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  Priority support
                </li>
              </ul>
              <UButton color="neutral" size="lg" class="w-full bg-black text-white hover:bg-stone-800">Upgrade to Pro</UButton>
            </div>
          </div>
        </div>
        
        <div class="mt-8 text-center">
          <p class="text-stone-600">
            Need help choosing? <NuxtLink to="/contact" class="text-black font-semibold hover:underline">Contact our team</NuxtLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Billing & Plans | KrabiClaw',
  description: 'Choose the perfect plan for your restaurant website needs.'
})
</script>
