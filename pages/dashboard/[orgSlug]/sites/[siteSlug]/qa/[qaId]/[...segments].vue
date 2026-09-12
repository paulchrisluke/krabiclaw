<template>
  <QaEditorPage />
</template>

<script setup lang="ts">
import QaEditorPage from '~/components/dashboard/QaEditorPage.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.qa', ownsChrome: true })
</script>
