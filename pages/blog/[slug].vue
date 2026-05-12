<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">
      <NuxtLink to="/blog" class="inline-flex items-center text-(--ui-text-muted) hover:text-(--ui-text) mb-8 transition-colors">
        ← Back to Blog
      </NuxtLink>

      <div v-if="pending" class="space-y-4">
        <div class="h-12 bg-(--ui-bg-elevated) rounded animate-pulse w-3/4" />
        <div class="h-6 bg-(--ui-bg-elevated) rounded animate-pulse w-1/2" />
        <div class="mt-8 space-y-3">
          <div v-for="i in 8" :key="i" class="h-4 bg-(--ui-bg-elevated) rounded animate-pulse" />
        </div>
      </div>

      <div v-else-if="error || !post" class="text-center py-24">
        <p class="text-xl text-(--ui-text-muted) mb-4">Article not found.</p>
        <UButton to="/blog" variant="outline" color="neutral">Back to Blog</UButton>
      </div>

      <article v-else>
        <div class="mb-8">
          <div class="flex items-center gap-3 mb-4">
            <span v-if="post.category" class="px-3 py-1 rounded-full text-sm font-medium" :class="categoryClass(post.category)">
              {{ post.category }}
            </span>
            <span class="text-(--ui-text-dimmed) text-sm">{{ formatDate(post.published_at) }}</span>
            <span class="text-(--ui-text-dimmed) text-sm">· {{ readTime }} min read</span>
          </div>
          <h1 class="text-4xl font-bold text-(--ui-text) mb-4 leading-tight">{{ post.title }}</h1>
          <p v-if="post.excerpt" class="text-xl text-(--ui-text-muted)">{{ post.excerpt }}</p>
        </div>

        <div class="h-64 bg-linear-to-br from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-800/20 rounded-2xl mb-10" />

        <div class="prose prose-lg max-w-none text-(--ui-text)" v-html="renderedBody" />

        <div class="mt-16 pt-8 border-t border-(--ui-border)">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-semibold text-(--ui-text)">KrabiClaw</p>
              <p class="text-sm text-(--ui-text-muted)">Restaurant website builder built in Krabi, Thailand</p>
            </div>
            <UButton to="/blog" variant="outline" color="neutral">More Articles</UButton>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'

definePageMeta({ layout: 'platform' })

const route = useRoute()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl

const CATEGORY_CLASSES: Record<string, string> = {
  Marketing: 'bg-amber-100 text-amber-800',
  Technology: 'bg-emerald-100 text-emerald-800',
  Design: 'bg-indigo-100 text-indigo-800',
  Business: 'bg-rose-100 text-rose-800',
  SEO: 'bg-violet-100 text-violet-800',
  'Social Media': 'bg-sky-100 text-sky-800',
}

const { data, pending, error } = await useAsyncData(
  `blog-post-${route.params.slug}`,
  () => $fetch(`/api/public/blog/posts/${route.params.slug}`)
)

const post = computed(() => (data.value as any)?.post ?? null)

const renderedBody = computed(() => {
  if (!post.value?.body) return ''
  const html = marked.parse(post.value.body) as string
  return DOMPurify.sanitize(html)
})

const readTime = computed(() => {
  const words = (post.value?.body ?? '').split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
})

function categoryClass(cat: string) {
  return CATEGORY_CLASSES[cat] ?? 'bg-stone-100 text-stone-800'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

useSeoMeta({
  title: computed(() => post.value ? `${post.value.title} | KrabiClaw Blog` : 'Blog | KrabiClaw'),
  description: computed(() => post.value?.excerpt ?? 'Restaurant tips and insights from KrabiClaw.'),
  ogUrl: computed(() => `${siteUrl}/blog/${route.params.slug}`)
})
</script>
