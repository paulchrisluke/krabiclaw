<template>
  <slot />
</template>

<script setup lang="ts">
import '~/assets/css/platform-entry.css'

const platformStylesheetHref = '/_nuxt/surfaces/platform.css'

useHead({
  link: [{ rel: 'stylesheet', href: platformStylesheetHref }],
})
</script>
