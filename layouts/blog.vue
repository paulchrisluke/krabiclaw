<template>
  <div class="platform-layout platform-theme min-h-screen flex flex-col font-sans selection:bg-stone-900 selection:text-white">
    <UTheme :ui="{}">
      <PlatformHeader />
      <main class="grow">
        <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div class="mb-6 lg:hidden">
            <UButton icon="i-lucide-menu" color="neutral" variant="outline" @click="mobileNavOpen = true">
              Browse blog
            </UButton>
          </div>

          <div class="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside class="hidden lg:block">
              <BlogSidebar />
            </aside>

            <div class="min-w-0">
              <slot />
            </div>
          </div>
        </div>
      </main>
      <LazyPlatformFooter />
    </UTheme>

    <USlideover v-model:open="mobileNavOpen" side="left" title="Blog">
      <template #body>
        <BlogSidebar @navigate="mobileNavOpen = false" />
      </template>
    </USlideover>
  </div>
</template>

<script setup>
import PlatformHeader from '~/components/platform/PlatformHeader.vue'

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
