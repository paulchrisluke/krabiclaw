<template>
  <ProductEditorPage />
</template>

<script setup lang="ts">
import ProductEditorPage from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.products' })
</script>
