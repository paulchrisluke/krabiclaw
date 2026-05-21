<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-5">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-heroicons-sparkles" class="size-5" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Pro feature</p>
              <h2 class="mt-1 text-lg font-semibold text-highlighted">
                {{ featureTitle }}
              </h2>
            </div>
          </div>
          <UButton
            icon="i-heroicons-x-mark"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Close modal"
            @click="close"
          />
        </div>

        <p class="text-sm leading-relaxed text-muted">{{ featureDescription }}</p>

        <ul class="mt-5 space-y-2 text-sm text-default">
          <li v-for="item in featureBullets" :key="item" class="flex gap-2">
            <UIcon name="i-heroicons-check-circle" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{{ item }}</span>
          </li>
        </ul>

        <div class="mt-6">
          <UButton :to="orgSettings.billing.value" color="primary" block @click="close">
            Get Pro
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { isOpen, feature, close } = useUpgradeModal()
const orgSettings = useOrgSettings()

const featureMap: Record<string, { title: string; description: string }> = {
  'qa-writeback': {
    title: 'Ask a question',
    description: 'Let guests submit questions directly from your site, synced back to Google Business Q&A. Included in Pro.'
  },
  'custom-domain': {
    title: 'Custom domain',
    description: 'Connect your own domain (yourdomain.com) instead of a krabiclaw.com subdomain. Included in Pro.'
  },
  'add-location': {
    title: 'Add a second location',
    description: 'Manage multiple locations under one brand site, each with their own menu, reviews, and hours. Included in Pro.'
  },
  'connect-gmb': {
    title: 'Connect Google Business',
    description: 'Sync hours, reviews, photos, and posts automatically from your Google Business Profile. Included in Pro.'
  },
  'google-business-sync': {
    title: 'Google Business sync',
    description: 'Auto-sync Google Business fields while keeping manual edits available in the site editor. Included in Pro.'
  },
  'remove-branding': {
    title: 'Remove KrabiClaw branding',
    description: 'Remove the "Powered by krabiclaw.com" footer strip from your tenant site. Included in Pro.'
  }
}

const featureTitle = computed(() => featureMap[feature.value]?.title ?? 'Pro feature')
const featureDescription = computed(
  () => featureMap[feature.value]?.description ?? 'This feature is available on the Pro plan.'
)
const featureBullets = computed(() => {
  if (feature.value === 'google-business-sync' || feature.value === 'connect-gmb') {
    return [
      'Auto-fill Google Business fields when connected',
      'Keep manual edits available in the content editor',
      'Sync business details, hours, photos, reviews, and posts'
    ]
  }
  if (feature.value === 'custom-domain') {
    return [
      'Connect your own domain',
      'Use managed HTTPS certificates',
      'Keep your krabiclaw.com subdomain available'
    ]
  }
  return [
    'Unlock this Pro workflow',
    'Manage it from the dashboard',
    'Keep the rest of your current site setup'
  ]
})
</script>
