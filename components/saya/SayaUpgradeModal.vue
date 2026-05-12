<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-8">
        <div class="mb-6 flex items-start justify-between gap-4">
          <div>
            <p class="saya-eyebrow mb-3 text-muted">Upgrade required</p>
            <h2 class="saya-display saya-italic text-3xl text-default leading-tight">
              {{ featureTitle }}
            </h2>
          </div>
          <button
            class="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Close modal"
            @click="close"
          >
            <UIcon name="i-heroicons-x-mark" class="size-4 text-muted" />
          </button>
        </div>

        <p class="text-sm leading-relaxed text-muted mb-8">{{ featureDescription }}</p>

        <!-- Plan comparison -->
        <div class="grid grid-cols-2 gap-3 mb-8">
          <div class="rounded-2xl border border-default bg-elevated p-4">
            <p class="saya-eyebrow mb-3 text-muted">Free</p>
            <ul class="space-y-2 text-sm text-muted">
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-default" />
                Saya website theme
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-default" />
                Subdomain hosting
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-default" />
                Manual editor
              </li>
              <li class="flex items-center gap-2 opacity-40">
                <UIcon name="i-heroicons-x-mark" class="size-3.5 shrink-0" />
                {{ featureTitle }}
              </li>
            </ul>
          </div>
          <div class="rounded-2xl border-2 border-primary bg-elevated p-4">
            <div class="mb-3 flex items-center justify-between">
              <p class="saya-eyebrow text-primary">Pro · $25/mo</p>
              <UBadge color="primary" size="xs">Recommended</UBadge>
            </div>
            <ul class="space-y-2 text-sm text-default">
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-primary" />
                Everything in Free
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-primary" />
                Custom domain
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-primary" />
                Google Business sync
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-heroicons-check" class="size-3.5 shrink-0 text-primary" />
                {{ featureTitle }}
              </li>
            </ul>
          </div>
        </div>

        <div class="flex gap-3">
          <UButton
            to="/billing"
            color="neutral"
            variant="solid"
            block
            class="rounded-full"
          >
            Upgrade to Pro
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            class="rounded-full shrink-0"
            @click="close"
          >
            Not now
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const { isOpen, feature, close } = useUpgradeModal()

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
  'remove-branding': {
    title: 'Remove KrabiClaw branding',
    description: 'Remove the "Powered by krabiclaw.com" footer strip from your tenant site. Included in Pro.'
  }
}

const featureTitle = computed(() => featureMap[feature.value]?.title ?? 'Pro feature')
const featureDescription = computed(
  () => featureMap[feature.value]?.description ?? 'This feature is available on the Pro plan.'
)
</script>
