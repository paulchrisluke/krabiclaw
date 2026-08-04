<template>
  <slot />
</template>

<script setup lang="ts">
import platformStylesheet from '~/assets/css/platform-entry.css?url'

const platformStylesheetHref = new URL(platformStylesheet, 'http://nuxt.local').pathname

useHead({
  link: [{ rel: 'stylesheet', href: platformStylesheetHref }],
})
</script>
