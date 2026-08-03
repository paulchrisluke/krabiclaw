<template>
  <div class="min-h-screen bg-default flex items-center justify-center px-6 py-12">
    <main class="w-full max-w-md">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import platformStylesheet from '~/assets/css/platform-entry.css?url'

useHead({
  link: [{ rel: 'stylesheet', href: platformStylesheet }],
})
</script>
