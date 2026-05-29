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
        <UButton v-if="hasOrderLinks" to="/order" color="primary" variant="solid" size="xl" class="rounded-full">Order Now</UButton>
        <UButton
          :to="ctaRoute"
          color="primary"
          :variant="hasOrderLinks ? 'outline' : 'solid'"
          size="xl"
          class="rounded-full"
        >
          {{ reserveCta }}
        </UButton>
      </div>
    </div>
  </AppSection>
</template>

<script setup lang="ts">

import { computed } from 'vue'
import { useBootstrap } from '~/composables/useBootstrap'

defineProps({
  title: String,
  description: String,
  ctaRoute: String,
  reserveCta: String,
  bg: { type: String, default: 'default' },
  padding: { type: String, default: 'lg' }
})

const { locations } = useBootstrap()
const hasOrderLinks = computed(() =>
  locations.value.some((loc: { grab_url?: string; uber_eats_url?: string; foodpanda_url?: string }) => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)
</script>
