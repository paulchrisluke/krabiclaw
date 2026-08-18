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
defineProps<{ items: Array<{ id: string; url: string; label: string }> }>()

function isExternal(url: string) {
  return /^https?:\/\//i.test(url)
}
</script>
