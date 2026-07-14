<template>
  <div
    v-if="consent === null"
    class="fixed inset-x-0 bottom-0 z-[200] border-t px-4 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.25)] sm:px-6"
    :class="variant === 'blawby' ? 'border-[var(--blawby-border)] bg-[var(--blawby-primary-800)]' : 'border-default bg-elevated'"
    role="region"
    aria-label="Cookie consent"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm leading-6" :class="variant === 'blawby' ? 'text-white/80' : 'text-muted'">
        We use cookies for marketing and analytics.
        <NuxtLink
          v-if="privacyPath"
          :to="privacyPath"
          class="underline"
          :class="variant === 'blawby' ? 'text-white hover:text-white/80' : 'text-default hover:text-muted'"
        >
          Learn more
        </NuxtLink>
      </p>
      <div class="flex shrink-0 gap-2">
        <button
          type="button"
          class="rounded-md border px-4 py-2 text-sm font-semibold transition"
          :class="variant === 'blawby' ? 'border-white/20 text-white hover:bg-white/10' : 'border-default text-default hover:bg-muted'"
          @click="reject"
        >
          Reject
        </button>
        <button
          type="button"
          class="rounded-md px-4 py-2 text-sm font-semibold transition"
          :class="variant === 'blawby' ? 'bg-[var(--blawby-accent)] text-white hover:bg-[var(--blawby-accent-strong)]' : 'bg-primary text-inverted hover:opacity-90'"
          @click="accept"
        >
          Accept
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  privacyPath?: string | null
  variant?: 'blawby' | 'default'
}>(), {
  privacyPath: null,
  variant: 'default',
})

const { consent, accept, reject } = useCookieConsent()
</script>
