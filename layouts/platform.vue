<template>
  <div :class="{ 'platform-docs': section === 'docs' }" class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
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

// The stable surface file is written by `nuxt build`; under `nuxt dev` Vite serves
// the imported entry itself, so the link exists only in built output.
useHead({
  link: import.meta.dev ? [] : [{ rel: 'stylesheet', href: '/_nuxt/surfaces/platform.css' }],
})

// Krabiclaw's blog and docs pages name their collection; the header says which.
const route = useRoute()
const section = computed(() => route.meta.articleCollection === 'docs' ? 'docs' as const
  : route.meta.articleCollection === 'blog' ? 'blog' as const : 'platform' as const)

// Krabiclaw's public pages have one theme: dark. It is rendered on the server
// so a visitor never sees a light frame first.
useHead(() => ({
  htmlAttrs: { class: section.value === 'docs' ? 'light' : 'dark', 'data-theme': section.value === 'docs' ? 'light' : 'dark' },
  titleTemplate: (title) => title ? `${title} | Krabiclaw` : 'Krabiclaw | AI Website Platform'
}))
</script>

<style>
/* Platform-specific base styles */
.platform-layout {
  background-color: var(--ui-bg);
  color: var(--ui-text);
}
.platform-docs {
  --ui-bg: #fff;
  --ui-bg-elevated: #f7f8fa;
  --ui-bg-muted: #f3f4f6;
  --ui-bg-accented: #eef0f3;
  --ui-text: #303744;
  --ui-text-muted: #566171;
  --ui-text-dimmed: #677181;
  --ui-text-highlighted: #202632;
  --ui-text-toned: #454e5d;
  --ui-border: #e6e9ef;
  --ui-border-muted: #d8dde5;
  --ui-border-accented: #c5ccd7;
  --ui-primary: #aa4437;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.platform-docs h1, .platform-docs h2, .platform-docs h3 { font-family: inherit; }
</style>
