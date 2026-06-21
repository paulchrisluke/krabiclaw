<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h1 class="text-xl font-semibold text-highlighted">Help Center</h1>
        <p class="mt-1 text-sm text-muted">Get help with your KrabiClaw website.</p>
      </template>

      <div class="grid gap-4 sm:grid-cols-2">
        <UCard :ui="{ body: { padding: 'p-5 sm:p-5' } }">
          <h3 class="font-semibold text-highlighted mb-2">Getting Started</h3>
          <p class="text-sm text-muted mb-4">Learn how to set up your website and connect Google Business.</p>
          <UButton variant="soft" color="primary" size="sm" icon="i-heroicons-book-open" @click="openGuide">
            View Guide
          </UButton>
        </UCard>

        <UCard :ui="{ body: { padding: 'p-5 sm:p-5' } }">
          <h3 class="font-semibold text-highlighted mb-2">Contact Support</h3>
          <p class="text-sm text-muted mb-4">Get help from our team via email or WhatsApp.</p>
          <UButton variant="soft" color="primary" size="sm" icon="i-heroicons-chat-bubble-left-ellipsis" @click="contactSupport">
            Contact Us
          </UButton>
        </UCard>
      </div>
    </UCard>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'dashboard' })

function openGuide() {
  navigateTo('/docs/getting-started')
}

function contactSupport() {
  window.location.href = 'mailto:hello@krabiclaw.com'
}
</script>
