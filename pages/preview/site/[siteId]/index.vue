<template>
  <HomePage />
</template>

<script setup lang="ts">
import HomePage from '~/pages/index.vue'

// HomePage sets layout: false and wraps itself in <NuxtLayout name="saya">,
// so applying layout: 'saya' here too would double-render SayaHeader/Footer.
</script>
