<template>
  <AppSection :bg="bg" :padding="padding">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
      <div class="max-w-3xl">
        <h3 v-if="title" data-field="cta.title" class="saya-display saya-italic text-5xl text-default leading-none">
          {{ title }}
        </h3>
        <div
          v-if="description"
          data-field="cta.description"
          class="mt-5 max-w-2xl text-sm leading-7 text-muted"
        >
          {{ description }}
        </div>
      </div>
      <div class="flex flex-wrap gap-4">
        <NuxtLink v-if="hasOrderLinks" to="/order" class="inline-flex items-center justify-center rounded-full bg-(--brand-color) px-6 py-3 text-base font-medium text-(--brand-color-foreground) no-underline transition hover:opacity-90">{{ $t('saya.cta.order_now') }}</NuxtLink>
        <NuxtLink
          :to="ctaRoute"
          class="inline-flex items-center justify-center rounded-full px-6 py-3 text-base font-medium no-underline transition"
          :class="hasOrderLinks ? 'ring-1 ring-inset ring-(--brand-color) text-(--brand-color) hover:bg-(--brand-color)/10' : 'bg-(--brand-color) text-(--brand-color-foreground) hover:opacity-90'"
        >
          {{ reserveCta || $t('saya.cta.reserve') }}
        </NuxtLink>
      </div>
    </div>
  </AppSection>
</template>

<script setup lang="ts">

import { computed } from 'vue'

defineProps({
  title: String,
  description: String,
  ctaRoute: String,
  reserveCta: String,
  bg: { type: String, default: 'white' },
  padding: { type: String, default: 'lg' }
})

const { locations } = useSiteShell()
const hasOrderLinks = computed(() =>
  locations.value.some((loc: { grab_url?: string; uber_eats_url?: string; foodpanda_url?: string }) => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)
</script>
