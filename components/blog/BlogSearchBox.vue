<template>
  <div class="relative">
    <input
      v-model="query"
      type="search"
      :placeholder="placeholder"
      class="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-500"
      @keydown.esc="query = ''"
    >
    <div
      v-if="query.trim()"
      class="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <div v-if="loading" class="px-4 py-3 text-sm text-gray-500">Searching...</div>
      <div v-else-if="results.length === 0" class="px-4 py-3 text-sm text-gray-500">No results found</div>
      <NuxtLink
        v-for="result in results"
        v-else
        :key="result.id"
        :to="result.path"
        class="block border-t border-gray-100 px-4 py-3 text-left no-underline first:border-t-0 hover:bg-gray-50"
        @click="query = ''"
      >
        <p class="text-sm font-semibold text-gray-900">{{ result.title }}</p>
        <p class="mt-1 line-clamp-2 text-xs text-gray-500">{{ result.snippet }}</p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PublicSearchResult } from '~/server/utils/public-search'

withDefaults(defineProps<{
  placeholder?: string
}>(), {
  placeholder: 'Search posts...',
})

interface SearchResponse {
  results: PublicSearchResult[]
}

const query = ref('')
const loading = ref(false)
const results = ref<PublicSearchResult[]>([])
let debounceHandle: ReturnType<typeof setTimeout> | null = null
let requestSequence = 0

async function runSearch() {
  const normalized = query.value.trim()
  if (!normalized) {
    requestSequence += 1
    results.value = []
    loading.value = false
    return
  }

  const requestId = ++requestSequence
  loading.value = true
  try {
    const response = await $fetch<SearchResponse>('/api/public/search', {
      query: { q: normalized, surface: 'tenant_blog' },
    })
    if (requestId !== requestSequence) return
    results.value = response.results ?? []
  } catch {
    if (requestId !== requestSequence) return
    results.value = []
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

watch(query, () => {
  if (debounceHandle) clearTimeout(debounceHandle)
  debounceHandle = setTimeout(() => {
    void runSearch()
  }, 120)
})

onBeforeUnmount(() => {
  if (debounceHandle) clearTimeout(debounceHandle)
})
</script>
