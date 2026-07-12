<template>
  <div
    v-if="consent === null"
    class="fixed inset-x-0 bottom-0 z-[200] border-t border-white/10 bg-neutral-900 px-4 py-4 text-white shadow-[0_-4px_24px_rgba(0,0,0,0.25)] sm:px-6"
    role="region"
    aria-label="Cookie consent"
  >
    <div class="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="text-sm leading-6 text-neutral-200">
        We use cookies for marketing and analytics.
        <NuxtLink v-if="privacyPath" :to="privacyPath" class="underline hover:text-white">Learn more</NuxtLink>
      </p>
      <div class="flex shrink-0 gap-2">
        <button
          type="button"
          class="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          @click="reject"
        >
          Reject
        </button>
        <button
          type="button"
          class="rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-200"
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
}>(), {
  privacyPath: null,
})

const { consent, accept, reject } = useCookieConsent()
</script>
