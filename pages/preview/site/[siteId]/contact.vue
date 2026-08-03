<template>
  <NuxtPage v-if="route.path.endsWith('/contact/confirmed')" />
  <ContactPage v-else />
</template>

<script setup lang="ts">
import ContactPage from '~/pages/contact/index.vue'
const route = useRoute()

// ContactPage sets layout: false and wraps itself in <NuxtLayout name="saya">,
// so applying layout: 'saya' here too would double-render SayaHeader/Footer.
</script>
