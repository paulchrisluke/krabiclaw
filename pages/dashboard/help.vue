<template>
  <div class="space-y-6">
    <div class="bg-[var(--ui-bg)] rounded-lg shadow-sm border border-[var(--ui-border)] dark:border-[var(--ui-border)] p-6">
      <h1 class="text-2xl font-bold text-(--ui-text-highlighted)  mb-4">Help Center</h1>
      <p class="text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-6">
        Get help with your KrabiClaw restaurant website.
      </p>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="p-4 border border-[var(--ui-border)] dark:border-[var(--ui-border)] rounded-lg">
          <h3 class="font-semibold text-(--ui-text-highlighted)  mb-2">Getting Started</h3>
          <p class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-3">Learn how to set up your restaurant website</p>
          <UButton variant="ghost" color="info" size="sm">
            View Guide
          </UButton>
        </div>
        
        <div class="p-4 border border-[var(--ui-border)] dark:border-[var(--ui-border)] rounded-lg">
          <h3 class="font-semibold text-(--ui-text-highlighted)  mb-2">Contact Support</h3>
          <p class="text-sm text-(--ui-text-muted) dark:text-(--ui-text-dimmed) mb-3">Get help from our support team</p>
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
