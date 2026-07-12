<template>
  <div />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'platform' })

await navigateTo('/pricing', {
  redirectCode: 301,
  replace: true,
})
</script>
