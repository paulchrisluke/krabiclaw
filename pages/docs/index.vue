<template>
  <div>
    <h1 class="text-4xl font-bold text-default mb-6">Documentation</h1>
    <p class="text-lg text-muted mb-12">Learn how to use KrabiClaw to build your business website</p>

    <div v-if="pending" class="text-center py-12">
      <p class="text-muted">Loading documentation...</p>
    </div>

    <div v-else-if="docsError" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <p class="text-red-600">Failed to load documentation</p>
    </div>

    <div v-else>
      <div v-if="docsWithCategorySlug.length === 0" class="text-center py-12">
        <p class="text-muted">No documentation available yet.</p>
      </div>

      <div v-else class="grid md:grid-cols-2 gap-6 mb-12">
        <NuxtLink
          v-for="doc in docsWithCategorySlug"
          :key="doc.slug"
          :to="`/docs/${doc.categorySlug}/${doc.slug}`"
          class="block"
        >
          <UCard class="hover:shadow-md transition-shadow cursor-pointer h-full">
            <h3 class="text-xl font-bold text-default mb-2">{{ doc.title }}</h3>
            <p v-if="doc.excerpt" class="text-muted line-clamp-2">{{ doc.excerpt }}</p>
          </UCard>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { categoryToSlug } from '~/utils/docs-categories'

definePageMeta({ layout: 'docs' })

const { data, pending, error: docsError } = await useFetch('/api/public/docs', {
  default: () => ({ docs: [] })
})

const docs = computed(() => data.value?.docs || [])
const docsWithCategorySlug = computed(() =>
  docs.value
    .map(doc => ({ ...doc, categorySlug: categoryToSlug(doc.category) }))
    .filter(doc => doc.categorySlug),
)

usePlatformPageSeo({
  path: '/docs',
  title: 'Documentation',
  description: 'Documentation for KrabiClaw website builder for local businesses. Learn how to use all features.',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Documentation', url: '/docs' },
  ],
})
</script>
