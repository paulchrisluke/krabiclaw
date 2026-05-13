<template>
  <div class="min-h-screen bg-muted flex items-center justify-center px-4">
    <div class="max-w-md w-full text-center">
      <!-- 404 Icon -->
      <div class="mb-8">
        <div class="mx-auto w-24 h-24 bg-stone-200 rounded-full flex items-center justify-center">
          <svg class="w-12 h-12 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
      </div>

      <!-- Error Message -->
      <h1 class="text-3xl font-bold text-highlighted mb-4">
        Site Not Found
      </h1>
      
      <p class="text-muted mb-8">
        The restaurant website you're looking for doesn't exist or hasn't been set up yet.
      </p>

      <!-- Actions -->
      <div class="space-y-4">
        <div class="text-sm text-stone-500">
          Are you a restaurant owner trying to set up your site?
        </div>
        
        <NuxtLink
          to="/login"
          class="inline-flex items-center px-6 py-3 bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
        >
          Sign In
        </NuxtLink>
        
        <div class="text-xs text-stone-400">
          This is a restaurant website subdomain.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })
// SEO: Add noindex for tenant error pages
useHead({
  meta: [
    { name: 'robots', content: 'noindex, nofollow' }
  ],
  title: 'Site Not Found - KrabiClaw'
})
</script>
