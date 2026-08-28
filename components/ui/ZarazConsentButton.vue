<template>
  <button
    type="button"
    class="inline-flex min-h-9 items-center rounded-full border border-white/40 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:border-white/70 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    @click="showZarazConsentModal"
  >
    Cookie preferences
  </button>
</template>

<script setup lang="ts">
import { showZarazConsentModal } from '~/utils/zaraz-consent'
</script>
