<template>
  <div class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <UTheme :ui="{}" :props="{ button: { color: 'primary' } }">
      <PlatformHeader />
      <main>
        <slot />
      </main>
      <PlatformFooter />
    </UTheme>
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
  background-color: var(--ui-bg);
  color: var(--ui-text);
}
</style>
