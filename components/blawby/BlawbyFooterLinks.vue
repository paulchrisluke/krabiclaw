<template>
  <ul class="mt-6 space-y-4" role="list">
    <li v-for="item in items" :key="item.id">
      <a
        v-if="isExternal(item.url)"
        :href="item.url"
        class="text-sm leading-6 text-gray-300 no-underline hover:text-white"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ item.label }}
      </a>
      <NuxtLink v-else :to="item.url" class="text-sm leading-6 text-gray-300 no-underline hover:text-white">
        {{ item.label }}
      </NuxtLink>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { PublicNavigationItem } from '~/types/blawby'

defineProps<{ items: PublicNavigationItem[] }>()

function isExternal(url: string) {
  return /^https?:\/\//i.test(url)
}
</script>
