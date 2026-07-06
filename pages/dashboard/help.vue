<template>
  <UPage>
    <UPageBody class="h-full min-h-0 p-0">
      <PublicHelpChowBot />
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import PublicHelpChowBot from '~/components/platform/PublicHelpChowBot.vue'

definePageMeta({ layout: 'dashboard' })
</script>
