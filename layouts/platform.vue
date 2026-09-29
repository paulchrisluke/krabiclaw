<template>
  <div class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <PlatformHeader :section="section" />
    <main class="grow">
      <slot />
    </main>
    <LazyPlatformFooter />
    <!-- An article page searches its own collection; the articles layout mounts that one. -->
    <PlatformCommandSearchModal v-if="section === 'platform'" surface="public" />
  </div>
</template>

<script setup lang="ts">
import PlatformHeader from '~/components/platform/PlatformHeader.vue'
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import '~/assets/css/platform-entry.css'

const platformStylesheetHref = '/_nuxt/surfaces/platform.css'

useHead(() => ({
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&display=swap' },
    { rel: 'stylesheet', href: platformStylesheetHref },
  ],
}))

// Krabiclaw's blog and docs pages name their collection; the header says which.
const route = useRoute()
const section = computed(() => route.meta.articleCollection === 'docs' ? 'docs' as const
  : route.meta.articleCollection === 'blog' ? 'blog' as const : 'platform' as const)

usePlatformTheme().bootstrap()

useHead({
  titleTemplate: (title) => title ? `${title} | Krabiclaw` : 'Krabiclaw | AI Website Platform'
})
</script>

<style>
/* Platform-specific base styles */
.platform-layout {
  background-color: var(--ui-bg);
  color: var(--ui-text);
}
</style>
