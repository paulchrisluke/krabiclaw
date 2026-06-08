<template>
  <div class="min-h-screen bg-muted flex items-center justify-center px-4">
    <div class="max-w-md w-full text-center">
      <!-- KrabiClaw Branding -->
      <div class="mb-8 flex justify-center">
        <a :href="siteUrl" class="flex flex-col items-center gap-3 group no-underline">
          <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="w-16 h-16 rounded-[14px] group-hover:rotate-12 transition-transform duration-200 shadow-sm" />
          <span class="kc-wordmark text-[24px]">
            <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span>
          </span>
        </a>
      </div>

      <!-- Error Message -->
      <h1 class="text-2xl font-bold text-highlighted mb-3">
        Site Not Found
      </h1>
      
      <p class="text-muted mb-8">
        This restaurant website is currently unavailable or doesn't exist.
      </p>

      <!-- Actions -->
      <div class="bg-elevated p-7 rounded-[18px] border border-default shadow-sm space-y-5 mt-4 text-left">
        <div class="text-[15px] text-default font-bold">
          Are you a restaurant owner?
        </div>
        
        <p class="text-[14px] text-muted">
          Build a beautiful, high-converting website for your restaurant in minutes with KrabiClaw.
        </p>

        <div class="flex flex-wrap gap-3 pt-2">
          <a
            :href="`${siteUrl}/pricing`"
            class="inline-flex items-center gap-2 bg-(--kc-coral) text-white font-semibold text-[15px] px-6 py-3.5 rounded-[10px] hover:opacity-90 transition-opacity no-underline w-full sm:w-auto justify-center"
          >
            View Plans
            <UIcon name="i-heroicons-arrow-right" class="size-4" />
          </a>
          <a
            :href="`${siteUrl}/login`"
            class="inline-flex items-center bg-transparent text-(--kc-teal-600) border border-(--kc-teal) font-semibold text-[15px] px-6 py-3.5 rounded-full hover:bg-(--kc-teal-100) transition-colors no-underline w-full sm:w-auto justify-center"
          >
            Sign In
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

definePageMeta({ layout: 'saya' })
// SEO: Add noindex for tenant error pages
useHead({
  meta: [
    { name: 'robots', content: 'noindex, nofollow' }
  ],
  title: 'Site Not Found - KrabiClaw'
})
</script>
