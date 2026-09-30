<template>
  <!--
    Every blog and Krabiclaw's docs, on every template: the site's own chrome,
    and inside it one article layout — the collection by category down the
    side, the page beside it. Below the width where the template's header
    collapses, the list moves into that header's menu: one navigation, not a
    second drawer beside the hamburger.
  -->
  <NuxtLayout :name="template.slug">
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" :class="split.grid">
      <aside class="hidden" :class="split.aside">
        <!-- Desktop search leads the sidebar; collapsed, it leads the header's menu. -->
        <PlatformCommandSearchTrigger
          v-if="nav.search"
          :surface="nav.search.surface"
          :variant="nav.search.variant"
          :label="searchLabel"
          :aria-label="searchLabel"
          class="mb-3"
        />
        <ArticleSidebar :nav="nav" />
      </aside>

      <div class="min-w-0">
        <PlatformCommandSearchTrigger
          v-if="nav.search && route.meta.articleCollection === 'docs'"
          :surface="nav.search.surface"
          :variant="nav.search.variant"
          :label="searchLabel"
          :aria-label="searchLabel"
          class="mb-6"
          :class="template.slug === 'platform' ? 'nav:hidden' : 'lg:hidden'"
        />
        <slot />
      </div>
    </div>

    <PlatformCommandSearchModal v-if="nav.search" :key="nav.search.surface" :surface="nav.search.surface" :variant="nav.search.variant" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import ArticleSidebar from '~/components/blog/ArticleSidebar.vue'
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import { articleNavKey } from '~/composables/useArticleNav'

const { t } = useI18n()
const route = useRoute()
const { template } = usePublicTemplate()
const nav = await useArticleNav()
provide(articleNavKey, nav)
const searchLabel = computed(() => t('saya.search.dialog_title', { surface: nav.value.indexLabel }))

// The sidebar shows exactly where the template's header stops collapsing:
// Krabiclaw's header at `nav` (1080px), the tenant templates' at `lg`.
const split = computed(() => template.value.slug === 'platform'
  ? { grid: 'nav:grid nav:grid-cols-[240px_minmax(0,1fr)] nav:gap-10', aside: 'nav:sticky nav:top-28 nav:block nav:h-fit nav:max-h-[calc(100vh-8rem)] nav:overflow-y-auto' }
  : { grid: 'lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10', aside: 'lg:sticky lg:top-28 lg:block lg:h-fit lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto' })
</script>
