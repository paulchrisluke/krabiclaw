<template>
  <slot />
</template>

<script setup lang="ts">
import '~/assets/css/platform-app-entry.css'

// The stable surface file is written by `nuxt build`; under `nuxt dev` Vite serves
// the imported entry itself, so the link exists only in built output.
useHead({
  link: import.meta.dev ? [] : [{ rel: 'stylesheet', href: '/_nuxt/surfaces/platform-app.css' }],
})
</script>
