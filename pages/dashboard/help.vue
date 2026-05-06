<template>
  <div class="space-y-6">
    <div class="bg-white rounded-lg shadow-sm border border-stone-200 p-6">
      <h1 class="text-2xl font-bold text-stone-900 mb-4">Help Center</h1>
      <p class="text-stone-600 mb-6">
        Get help with your KrabiClaw restaurant website.
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="p-4 border border-stone-200 rounded-lg">
          <h3 class="font-semibold text-stone-900 mb-2">Getting Started</h3>
          <p class="text-sm text-stone-600 mb-3">Learn how to set up your restaurant website</p>
          <UButton variant="ghost" color="blue" size="sm">
            View Guide
          </UButton>
        </div>
        
        <div class="p-4 border border-stone-200 rounded-lg">
          <h3 class="font-semibold text-stone-900 mb-2">Contact Support</h3>
          <p class="text-sm text-stone-600 mb-3">Get help from our support team</p>
          <UButton variant="ghost" color="blue" size="sm">
            Contact Us
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
</script>
