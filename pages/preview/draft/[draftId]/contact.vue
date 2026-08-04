<template>
  <NuxtPage v-if="route.path.endsWith('/contact/confirmed')" />
  <ContactPage v-else />
</template>

<script setup lang="ts">
import ContactPage from '~/pages/contact/index.vue'
const route = useRoute()
</script>
