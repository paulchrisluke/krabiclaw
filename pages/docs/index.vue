<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-4xl font-bold text-default mb-6">Documentation</h1>
      <p class="text-lg text-muted mb-12">Learn how to use KrabiClaw to build your business website</p>

      <div v-if="pending" class="text-center py-12">
        <p class="text-muted">Loading documentation...</p>
      </div>

      <div v-else-if="docsError" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <p class="text-red-600">Failed to load documentation</p>
      </div>

      <div v-else>
        <div v-if="docs.length === 0" class="text-center py-12">
          <p class="text-muted">No documentation available yet.</p>
        </div>

        <div v-else class="grid md:grid-cols-2 gap-6 mb-12">
          <NuxtLink
            v-for="doc in docs"
            :key="doc.slug"
            :to="`/docs/${doc.slug}`"
            class="block"
          >
            <UCard class="hover:shadow-md transition-shadow cursor-pointer h-full">
              <div class="flex flex-wrap gap-2 mb-2">
                <span v-if="doc.category" class="px-2 py-1 rounded-full text-xs font-medium bg-(--kc-teal) text-white">
                  {{ doc.category }}
                </span>
                <span v-if="doc.difficulty_level" class="px-2 py-1 rounded-full text-xs font-medium bg-(--kc-navy) text-white">
                  {{ doc.difficulty_level }}
                </span>
              </div>
              <h3 class="text-xl font-bold text-default mb-2">{{ doc.title }}</h3>
              <p v-if="doc.excerpt" class="text-muted mb-4 line-clamp-2">{{ doc.excerpt }}</p>
              <UButton variant="outline" color="neutral">View Guide</UButton>
            </UCard>
          </NuxtLink>
        </div>

        <div class="mt-12 bg-inverted text-inverted rounded-2xl p-8 text-center">
          <h2 class="text-2xl font-bold mb-4">Need Help?</h2>
          <p class="text-inverted/70 mb-6">Can't find what you're looking for? Check out our help center.</p>
          <UButton color="neutral" variant="outline" to="/help">Visit Help Center</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

const { data, pending, error: docsError } = await useFetch('/api/public/docs', {
  default: () => ({ docs: [] })
})

const docs = computed(() => data.value?.docs || [])

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
