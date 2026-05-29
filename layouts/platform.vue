<template>
  <div class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <UTheme :ui="{}">
      <PlatformHeader />
      <main class="grow">
        <slot />
      </main>
      <LazyPlatformFooter />
    </UTheme>
  </div>
</template>

<script setup>
import PlatformHeader from '~/components/platform/PlatformHeader.vue'


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
