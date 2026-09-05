<template>
  <ExperienceEditorPage />
</template>

<script setup lang="ts">
import ExperienceEditorPage from '~/components/dashboard/ExperienceEditorPage.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.experiences' })
</script>
