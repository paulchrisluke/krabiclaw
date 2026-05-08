<template>
  <div class="platform-layout min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <PlatformHeader />
    <main class="grow pt-16">
      <slot />
    </main>
    <PlatformFooter />
  </div>
</template>

<script setup>
import PlatformHeader from '~/components/platform/PlatformHeader.vue'
import PlatformFooter from '~/components/platform/PlatformFooter.vue'

useHead({
  titleTemplate: (title) => title ? `${title} | KrabiClaw` : 'KrabiClaw | AI Restaurant Platform'
})
</script>

<style>
/* Platform-specific base styles */
.platform-layout {
  background-color: #ffffff;
  color: #1c1917; /* stone-900 */
}
</style>
