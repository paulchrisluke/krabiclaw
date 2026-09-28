<template>
  <!--
    Every blog and Krabiclaw's docs, on every template: the site's own chrome,
    and inside it one article layout — the collection by category down the
    side, a drawer of the same list on a phone, the page beside it.
  -->
  <NuxtLayout :name="template.slug">
    <div class="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 lg:px-8">
      <aside class="hidden lg:sticky lg:top-28 lg:block lg:h-fit lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
        <ArticleSidebar :nav="nav" />
      </aside>

      <div class="min-w-0">
        <button
          type="button"
          class="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-current/15 px-3 py-2.5 text-sm font-medium opacity-80 transition hover:opacity-100 lg:hidden"
          aria-haspopup="dialog"
          :aria-expanded="open"
          @click="open = true"
        >
          <PlatformIcon name="list" class="size-4 shrink-0" />
          {{ t('saya.posts.browse_topics') }}
        </button>
        <slot />
      </div>
    </div>

    <PlatformDrawer v-model="open" :title="t('saya.posts.browse_topics')">
      <ArticleSidebar :nav="nav" @navigate="open = false" />
    </PlatformDrawer>
    <PlatformCommandSearchModal v-if="nav.search" :key="nav.search.surface" :surface="nav.search.surface" :variant="nav.search.variant" />
  </NuxtLayout>
</template>

<script setup lang="ts">
import ArticleSidebar from '~/components/blog/ArticleSidebar.vue'
import PlatformDrawer from '~/components/platform/PlatformDrawer.vue'
import PlatformCommandSearchModal from '~/components/platform/search/PlatformCommandSearchModal.vue'

const { t } = useI18n()
const { template } = usePublicTemplate()
const nav = await useArticleNav()
const open = ref(false)
</script>
