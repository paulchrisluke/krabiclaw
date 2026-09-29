<template>
  <nav :aria-label="nav.indexLabel" class="text-sm">
    <div v-for="group in nav.categories" :key="group.id" class="mb-4 last:mb-0">
      <NuxtLink
        :to="group.path"
        class="mb-1.5 block px-2.5 text-xs font-semibold uppercase tracking-wide no-underline transition"
        :class="route.path === group.path ? 'opacity-100' : 'opacity-50 hover:opacity-100'"
        @click="emit('navigate')"
      >{{ group.name }}</NuxtLink>
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
import type { ArticleNav } from '~/composables/useArticleNav'

defineProps<{ nav: ArticleNav }>()
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute()
</script>
