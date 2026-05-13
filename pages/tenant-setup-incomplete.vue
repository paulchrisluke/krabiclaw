<template>
  <div class="min-h-screen bg-muted flex items-center justify-center px-4">
    <div class="max-w-md w-full text-center">
      <!-- Error Icon -->
      <div class="mb-8">
        <div class="mx-auto w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center">
          <svg class="w-12 h-12 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
          </svg>
        </div>
      </div>

      <!-- Error Message -->
      <h1 class="text-3xl font-bold text-highlighted mb-4">
        Setup Incomplete
      </h1>
      
      <p class="text-muted mb-8">
        There was an issue setting up your restaurant website. You can retry the setup from your dashboard.
      </p>

      <!-- Actions -->
      <div class="space-y-4">
        <NuxtLink
          to="/dashboard"
          class="inline-flex items-center px-6 py-3 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >
          Go to Dashboard
        </NuxtLink>
        
        <div class="text-sm text-stone-500">
          Sign in to your KrabiClaw dashboard to retry site setup.
        </div>
      </div>

      <!-- Help Text -->
      <div class="mt-8 p-4 bg-elevated rounded-lg">
        <h3 class="text-sm font-medium text-highlighted mb-2">What happened?</h3>
        <p class="text-xs text-muted">
          Your site setup encountered an error during the content or menu configuration process. 
          This can usually be resolved by retrying the setup from your dashboard.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })
// SEO: Add noindex for setup pages
useHead({
  meta: [
    { name: 'robots', content: 'noindex, nofollow' }
  ],
  title: 'Setup Incomplete - KrabiClaw'
})
</script>
