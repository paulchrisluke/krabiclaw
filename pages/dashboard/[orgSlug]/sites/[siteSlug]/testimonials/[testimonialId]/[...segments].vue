<template>
  <TestimonialEditorPage />
</template>

<script setup lang="ts">
import TestimonialEditorPage from '~/components/dashboard/TestimonialEditorPage.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.testimonials', ownsChrome: true })
</script>
