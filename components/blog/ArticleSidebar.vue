<template>
  <nav :aria-label="nav.indexLabel" class="text-sm">
    <PlatformCommandSearchTrigger
      v-if="nav.search"
      :surface="nav.search.surface"
      :variant="nav.search.variant"
      :label="searchLabel"
      :aria-label="searchLabel"
      class="mb-3"
      @click="emit('navigate')"
    />

    <NuxtLink
      :to="nav.indexPath"
      class="mb-3 flex items-center gap-2 rounded-md px-2.5 py-1.5 font-semibold no-underline transition"
      :class="route.path === nav.indexPath ? 'bg-current/10' : 'opacity-70 hover:opacity-100'"
      @click="emit('navigate')"
    >
      <PlatformIcon name="newspaper" class="size-4 shrink-0" />
      <span class="truncate">{{ nav.indexLabel }}</span>
    </NuxtLink>

    <div v-for="group in nav.categories" :key="group.categorySlug" class="mb-4 last:mb-0">
      <p class="mb-1.5 px-2.5 text-xs font-semibold uppercase tracking-wide opacity-50">{{ group.category }}</p>
      <ul class="flex flex-col gap-0.5">
        <li v-for="article in group.posts" :key="article.id">
          <NuxtLink
            :to="article.path"
            :title="article.title"
            class="block rounded-md px-2.5 py-1.5 leading-snug no-underline transition"
            :class="route.path === article.path ? 'bg-current/10 font-semibold' : 'opacity-70 hover:bg-current/5 hover:opacity-100'"
            @click="emit('navigate')"
          >
            <span class="line-clamp-2">{{ article.title }}</span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import type { ArticleNav } from '~/composables/useArticleNav'

const props = defineProps<{ nav: ArticleNav }>()
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute()
const { t } = useI18n()
const searchLabel = computed(() => t('saya.search.dialog_title', { surface: props.nav.indexLabel }))
</script>
