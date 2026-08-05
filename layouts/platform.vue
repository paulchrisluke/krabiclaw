<template>
  <div class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <PlatformHeader />
    <main class="grow">
      <slot />
    </main>
    <LazyPlatformFooter />
    <ConsentBanner privacy-path="/privacy" />
  </div>
</template>

<script setup lang="ts">
import PlatformHeader from '~/components/platform/PlatformHeader.vue'
import ConsentBanner from '~/components/ConsentBanner.vue'
import platformStylesheet from '~/assets/css/platform-entry.css?url'
import platformHomeStylesheet from '~/assets/css/platform-home-entry.css?url'

const route = useRoute()
const platformStylesheetHref = computed(() => {
  const stylesheet = route.path === '/' ? platformHomeStylesheet : platformStylesheet
  return new URL(stylesheet, 'http://nuxt.local').pathname
})

useHead(() => ({
  link: [{ rel: 'stylesheet', href: platformStylesheetHref.value }],
}))

const platformTheme = usePlatformTheme()

if (import.meta.client) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  onMounted(() => platformTheme.restore())
  const onSystemThemeChange = () => platformTheme.sync()
  prefersDark.addEventListener('change', onSystemThemeChange)
  const stopThemeWatch = watch(platformTheme.preference, platformTheme.sync)

  onBeforeUnmount(() => {
    prefersDark.removeEventListener('change', onSystemThemeChange)
    stopThemeWatch()
  })
}

useHead({
  titleTemplate: (title) => title ? `${title} | KrabiClaw` : 'KrabiClaw | AI Website Platform'
})
</script>

<style>
/* Platform-specific base styles */
.platform-layout {
  background-color: var(--ui-bg);
  color: var(--ui-text);
}
</style>
