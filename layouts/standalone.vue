<template>
  <slot />
</template>

<script setup lang="ts">
import '~/assets/css/platform-app-entry.css'

const platformStylesheetHref = '/_nuxt/surfaces/platform-app.css'

useHead({
  link: [{ rel: 'stylesheet', href: platformStylesheetHref }],
})
</script>
