<template>
  <div class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <DocsHeader section="docs" @toggle-nav="mobileNavOpen = true" />
    <main class="grow">
      <div class="mx-auto max-w-450 px-4 sm:px-6 lg:px-10 py-10">
        <div class="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside class="hidden lg:block sticky top-24 h-[calc(100vh-7rem)] overflow-y-auto">
            <DocsSidebar />
          </aside>

          <!--
            Right-hand "on this page" TOC lives inside each page's own
            template (see pages/docs/[category]/[slug].vue), not here —
            pages set via definePageMeta({ layout: 'docs' }) render inside an
            implicit NuxtLayout wrapper with no named-slot passthrough from
            the page, so the layout can only own the sidebar column.
          -->
          <div class="min-w-0">
            <slot />
          </div>
        </div>
      </div>
    </main>
    <LazyPlatformFooter />

    <PlatformDrawer v-model="mobileNavOpen" title="Documentation">
      <DocsSidebar @navigate="mobileNavOpen = false" />
    </PlatformDrawer>
  </div>
</template>

<script setup>
import DocsHeader from '~/components/platform/DocsHeader.vue'
import PlatformDrawer from '~/components/platform/PlatformDrawer.vue'

const mobileNavOpen = ref(false)

useHead({
  titleTemplate: (title) => title ? `${title} | KrabiClaw` : 'KrabiClaw | AI Website Platform'
})
</script>

<style>
.platform-layout {
  background-color: var(--ui-bg);
  color: var(--ui-text);
}
</style>
