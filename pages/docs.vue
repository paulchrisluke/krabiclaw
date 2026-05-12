<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-4xl font-bold text-(--ui-text) mb-6">Documentation</h1>
      <p class="text-lg text-(--ui-text-muted) mb-12">Learn how to use KrabiClaw to build your restaurant website</p>

      <div v-if="pending" class="text-center py-12">
        <p class="text-(--ui-text-muted)">Loading documentation...</p>
      </div>

      <div v-else-if="docsError" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <p class="text-red-600">Failed to load documentation</p>
      </div>

      <div v-else>
        <div class="grid md:grid-cols-2 gap-6 mb-12">
          <NuxtLink
            v-for="doc in docs"
            :key="doc.slug"
            :to="`/docs/${doc.slug}`"
            class="block"
          >
            <UCard class="hover:shadow-md transition-shadow cursor-pointer h-full">
              <h3 class="text-xl font-bold text-(--ui-text) mb-2">{{ doc.title }}</h3>
              <p class="text-(--ui-text-muted) mb-4">Learn about {{ doc.title?.toLowerCase() || 'this topic' }}</p>
              <UButton variant="outline" color="neutral">View Guide</UButton>
            </UCard>
          </NuxtLink>
        </div>

        <div class="mt-12 bg-(--ui-bg-inverted) text-(--ui-text-inverted) rounded-2xl p-8 text-center">
          <h2 class="text-2xl font-bold mb-4">Need Help?</h2>
          <p class="text-(--ui-text-inverted)/70 mb-6">Can't find what you're looking for? Check out our help center.</p>
          <UButton color="neutral" variant="outline" to="/help">Visit Help Center</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

import { useBreadcrumbSchema } from '~/composables/useSchemaOrg'

const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

useBreadcrumbSchema([
  { name: 'Home', url: `${siteUrl}/` },
  { name: 'Documentation', url: `${siteUrl}/docs` }
])

const { data, pending, error: docsError } = await useFetch('/api/docs', {
  default: () => ({ docs: [] })
})

const docs = computed(() => data.value?.docs || [])

useSeoMeta({
  title: 'Documentation | KrabiClaw',
  description: 'Documentation for KrabiClaw restaurant website builder. Learn how to use all features.',
  ogImage: `${siteUrl}/og-image.jpg`,
  ogUrl: `${siteUrl}/docs`
})
</script>
