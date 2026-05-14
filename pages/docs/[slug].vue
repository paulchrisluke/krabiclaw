<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <NuxtLink to="/docs" class="inline-flex items-center text-primary hover:text-primary mb-6">
        ← Back to Documentation
      </NuxtLink>

      <div v-if="loading" class="text-center py-12">
        <p class="text-muted">Loading...</p>
      </div>

      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <p class="text-red-600">{{ error }}</p>
      </div>

      <div v-else>
        <h1 class="text-4xl font-bold text-default mb-6">{{ doc.title }}</h1>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="prose prose-lg max-w-none text-default" v-html="renderedContent"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

const route = useRoute()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

const { data: doc, pending: loading, error } = await useAsyncData(
  `doc-${route.params.slug}`,
  async () => {
    const response = await $fetch(`/api/docs/${route.params.slug}`)
    if (!response || typeof response.title !== 'string' || typeof response.content !== 'string') {
      throw createError({ statusCode: 404, statusMessage: 'Invalid documentation format' })
    }
    return response
  }
)

const renderedContent = computed(() => {
  if (!doc.value?.content) return ''
  const html = marked.parse(doc.value.content)
  return DOMPurify.sanitize(html)
})

useSeoMeta({
  title: computed(() => `${doc.value?.title || 'Documentation'} | KrabiClaw Docs`),
  description: computed(() => `Learn about ${doc.value?.title || 'this topic'} in KrabiClaw documentation.`),
  ogImage: `${siteUrl}/og-image.jpg`,
  ogUrl: computed(() => `${siteUrl}/docs/${route.params.slug}`)
})
</script>
