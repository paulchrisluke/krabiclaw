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
        <div class="flex flex-wrap items-center gap-3 mb-6">
          <span v-if="doc.category" class="px-3 py-1 rounded-full text-sm font-medium bg-(--kc-teal) text-white">
            {{ doc.category }}
          </span>
          <span v-if="doc.difficulty_level" class="px-3 py-1 rounded-full text-sm font-medium bg-(--kc-navy) text-white">
            {{ doc.difficulty_level }}
          </span>
          <span class="text-dimmed text-sm">{{ formatDate(doc.updated_at) }}</span>
        </div>

        <h1 class="text-4xl font-bold text-default mb-6">{{ doc.title }}</h1>

        <p v-if="doc.excerpt" class="text-xl text-muted mb-8 leading-relaxed">{{ doc.excerpt }}</p>

        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="prose prose-lg max-w-none text-default" v-html="renderedBody"></div>
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
    const response = await $fetch(`/api/public/docs/${route.params.slug}`)
    if (!response || !response.doc) {
      throw createError({ statusCode: 404, statusMessage: 'Documentation not found' })
    }
    return response.doc
  }
)

const renderedBody = computed(() => {
  if (!doc.value?.body) return ''
  const html = marked.parse(doc.value.body)
  return DOMPurify.sanitize(html)
})

function formatDate(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

useSeoMeta({
  title: computed(() => `${doc.value?.title || 'Documentation'} | KrabiClaw Docs`),
  description: computed(() => doc.value?.seo_description || doc.value?.excerpt || `Learn about ${doc.value?.title || 'this topic'} in KrabiClaw documentation.`),
  ogImage: `${siteUrl}/og-image.png`,
  ogUrl: computed(() => `${siteUrl}/docs/${route.params.slug}`)
})
</script>
