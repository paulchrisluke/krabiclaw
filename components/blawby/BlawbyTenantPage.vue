<template>
  <TenantPublicPage :path="path" />
</template>

<script setup lang="ts">
defineProps<{ path: string }>()
</script>
