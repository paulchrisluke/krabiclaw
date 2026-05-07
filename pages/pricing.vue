<template>
  <div class="min-h-screen bg-stone-50">
    <div class="container mx-auto px-4 py-16">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-16">
          <h1 class="text-5xl font-bold text-stone-900 mb-6">Simple, Transparent Pricing</h1>
          <p class="text-xl text-stone-600 max-w-3xl mx-auto">
            Choose the perfect plan for your restaurant. Start free and upgrade as you grow.
          </p>
        </div>

        <!-- Pricing Cards -->
        <div class="grid md:grid-cols-3 gap-8 mb-16">
          <!-- Free Plan -->
          <div class="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
            <h3 class="text-2xl font-bold text-stone-900 mb-2">Free</h3>
            <p class="text-stone-600 mb-6">Perfect for getting started</p>
            <div class="mb-6">
              <span class="text-4xl font-bold text-stone-900">$0</span>
              <span class="text-stone-600">/month</span>
            </div>
            <ul class="space-y-3 text-stone-600 mb-8">
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Krabiclaw subdomain (your-restaurant.krabiclaw.com)</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Saya restaurant theme</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Visual content editor</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Basic SEO optimization</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Mobile responsive design</span>
              </li>
            </ul>
            <UButton variant="outline" color="neutral" size="lg" class="w-full">Start Free</UButton>
          </div>

          <!-- Pro Plan -->
          <div class="bg-black text-white rounded-2xl shadow-lg p-8 transform scale-105">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-2xl font-bold">Pro</h3>
              <span class="bg-white text-black px-3 py-1 text-sm font-medium rounded-full">Most Popular</span>
            </div>
            <p class="text-stone-300 mb-6">For growing restaurants</p>
            <div class="mb-6">
              <span class="text-4xl font-bold">$25</span>
              <span class="text-stone-300">/month</span>
            </div>
            <ul class="space-y-3 text-stone-200 mb-8">
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Everything in Free, plus:</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Custom domain (your-restaurant.com)</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Free SSL certificate</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Google Business Profile integration</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Advanced SEO tools</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Priority customer support</span>
              </li>
            </ul>
            <UButton color="neutral" size="lg" class="w-full bg-white text-black hover:bg-stone-200">Start Pro Trial</UButton>
          </div>

          <!-- Enterprise Plan -->
          <div class="bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
            <h3 class="text-2xl font-bold text-stone-900 mb-2">Enterprise</h3>
            <p class="text-stone-600 mb-6">For restaurant chains</p>
            <div class="mb-6">
              <span class="text-4xl font-bold text-stone-900">Custom</span>
            </div>
            <ul class="space-y-3 text-stone-600 mb-8">
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Everything in Pro, plus:</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Multiple locations management</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Custom theme development</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>API access</span>
              </li>
              <li class="flex items-start">
                <svg class="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span>Dedicated account manager</span>
              </li>
            </ul>
            <UButton variant="outline" color="neutral" size="lg" class="w-full">Contact Sales</UButton>
          </div>
        </div>

        <!-- FAQ Section -->
        <div class="max-w-3xl mx-auto">
          <h2 class="text-3xl font-bold text-stone-900 text-center mb-12">Frequently Asked Questions</h2>
          <div class="space-y-6">
            <div class="bg-white rounded-xl p-6 border border-stone-200">
              <h3 class="text-lg font-semibold text-stone-900 mb-2">Can I change plans anytime?</h3>
              <p class="text-stone-600">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
            </div>
            <div class="bg-white rounded-xl p-6 border border-stone-200">
              <h3 class="text-lg font-semibold text-stone-900 mb-2">Do you offer refunds?</h3>
              <p class="text-stone-600">We offer a 30-day money-back guarantee for all paid plans.</p>
            </div>
            <div class="bg-white rounded-xl p-6 border border-stone-200">
              <h3 class="text-lg font-semibold text-stone-900 mb-2">What payment methods do you accept?</h3>
              <p class="text-stone-600">We accept all major credit cards, PayPal, and bank transfers for enterprise plans.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
useSeoMeta({
  title: 'Pricing | KrabiClaw',
  description: 'Simple, transparent pricing for restaurant websites. Choose the perfect plan for your needs.'
})
</script>
