<template>
  <div class="space-y-6">
    <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Help Center</h1>
      <p class="text-gray-600 dark:text-gray-400 mb-6">
        Get help with your KrabiClaw restaurant website.
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Getting Started</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Learn how to set up your restaurant website</p>
          <UButton variant="ghost" color="info" size="sm">
            View Guide
          </UButton>
        </div>
        
        <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h3 class="font-semibold text-gray-900 dark:text-white mb-2">Contact Support</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">Get help from our support team</p>
          <UButton variant="ghost" color="info" size="sm">
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
