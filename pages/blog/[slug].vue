<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-3xl mx-auto">

      <NuxtLink to="/blog" class="inline-flex items-center gap-2 text-muted hover:text-default mb-10 transition-colors text-sm">
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        Back to Blog
      </NuxtLink>

      <!-- Loading -->
      <div v-if="pending" class="space-y-4">
        <div class="h-6 bg-elevated rounded animate-pulse w-1/4" />
        <div class="h-12 bg-elevated rounded animate-pulse w-3/4" />
        <div class="h-12 bg-elevated rounded animate-pulse w-1/2" />
        <div class="h-5 bg-elevated rounded animate-pulse w-2/3 mt-4" />
        <div class="mt-8 space-y-3">
          <div v-for="i in 10" :key="i" class="h-4 bg-elevated rounded animate-pulse" :style="`width: ${70 + (i % 3) * 10}%`" />
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="error || !post" class="text-center py-24">
        <p class="text-xl text-muted mb-6">Article not found.</p>
        <UButton to="/blog" variant="outline" color="neutral">Back to Blog</UButton>
      </div>

      <!-- Article -->
      <article v-else>

        <!-- Meta row -->
        <div class="flex flex-wrap items-center gap-3 mb-6">
          <span v-if="post.category" class="px-3 py-1 rounded-full text-sm font-medium" :class="categoryClass(post.category)">
            {{ post.category }}
          </span>
          <span class="text-dimmed text-sm">{{ formatDate(post.published_at) }}</span>
          <span class="text-dimmed text-sm">·</span>
          <span class="text-dimmed text-sm">{{ readTime }} min read</span>
        </div>

        <!-- Title + excerpt -->
        <h1 class="text-4xl font-bold text-default mb-5 leading-tight">{{ post.title }}</h1>
        <p v-if="post.excerpt" class="text-xl text-muted mb-8 leading-relaxed">{{ post.excerpt }}</p>

        <!-- Author -->
        <div class="flex items-center gap-4 py-6 border-y border-default mb-10">
          <div class="shrink-0">
            <img
              v-if="post.author_image"
              :src="post.author_image"
              :alt="post.author_name"
              class="w-12 h-12 rounded-full object-cover"
            />
            <div
              v-else
              class="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style="background-color: var(--kc-teal)"
            >
              {{ authorInitial }}
            </div>
          </div>
          <div>
            <p class="font-semibold text-default">{{ post.author_name || 'KrabiClaw' }}</p>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dimmed">
              <span>Published {{ formatDate(post.published_at) }}</span>
              <span v-if="wasUpdated">· Updated {{ formatDate(post.updated_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Hero image -->
        <div v-if="postMedia.url" class="relative h-64 md:h-96 w-full overflow-hidden rounded-2xl mb-10">
          <video
            v-if="postMedia.isVideo"
            :src="postMedia.url"
            autoplay
            muted
            loop
            playsinline
            class="h-full w-full object-cover"
          />
          <img
            v-else
            :src="postMedia.url"
            :alt="post.title"
            class="h-full w-full object-cover"
          />
        </div>
        <div v-else class="h-64 bg-muted rounded-2xl mb-10" aria-hidden="true" />

        <!-- Body -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="prose prose-lg dark:prose-invert max-w-none
                 prose-headings:font-bold prose-headings:text-default
                 prose-p:text-muted prose-p:leading-relaxed
                 prose-a:text-(--kc-teal) prose-a:no-underline hover:prose-a:underline
                 prose-strong:text-default
                 prose-li:text-muted
                 prose-hr:border-default
                 prose-blockquote:border-l-(--kc-teal) prose-blockquote:text-muted"
          v-html="renderedBody"
        />
        <!-- eslint-enable vue/no-v-html -->

        <!-- Bottom author card -->
        <div class="mt-16 pt-8 border-t border-default flex items-center justify-between gap-6">
          <div class="flex items-center gap-4">
            <div class="shrink-0">
              <img
                v-if="post.author_image"
                :src="post.author_image"
                :alt="post.author_name"
                class="w-10 h-10 rounded-full object-cover"
              />
              <div
                v-else
                class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                style="background-color: var(--kc-teal)"
              >
                {{ authorInitial }}
              </div>
            </div>
            <div>
              <p class="font-semibold text-default text-sm">{{ post.author_name || 'KrabiClaw' }}</p>
              <p v-if="authorSubtitle" class="text-xs text-dimmed">{{ authorSubtitle }}</p>
            </div>
          </div>
          <UButton to="/blog" variant="outline" color="neutral" size="sm">More Articles</UButton>
        </div>

      </article>
    </div>
  </div>
</template>

<script setup lang="ts">


import { marked } from 'marked'
const { resolveMedia } = useMedia()

definePageMeta({ layout: 'platform' })

const route = useRoute()
const config = useRuntimeConfig()
const siteUrl = config.public.siteUrl
const postEndpoint = computed<string>(() => `/api/public/blog/posts/${String(route.params.slug)}`)

const CATEGORY_CLASSES: Record<string, string> = {
  Marketing: 'bg-amber-100 text-amber-800',
  Technology: 'bg-emerald-100 text-emerald-800',
  Design: 'bg-indigo-100 text-indigo-800',
  Business: 'bg-rose-100 text-rose-800',
  SEO: 'bg-violet-100 text-violet-800',
  'Social Media': 'bg-sky-100 text-sky-800',
}

const { data, pending, error } = await useAsyncData(
  () => `blog-post-${postEndpoint.value}`,
  () => $fetch<ApiValue>(postEndpoint.value as string),
  {
    transform: (payload: ApiValue) => {
      const rawPost = payload?.post
      if (!rawPost) return payload
      const authorSubtitle = rawPost.author_subtitle || rawPost.author_bio || rawPost.author?.bio || ''
      return {
        ...payload,
        post: {
          ...rawPost,
          author_subtitle: authorSubtitle
        }
      }
    }
  }
)

const post = computed(() => (data.value as ApiValue)?.post ?? null)

const authorSubtitle = computed(() => post.value?.author_subtitle || '')

const renderedBody = computed(() => {
  if (!post.value?.body) return ''
  const html = marked.parse(post.value.body) as string
  return DOMPurify.sanitize(html)
})

const readTime = computed(() => {
  const words = (post.value?.body ?? '').split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
})

const authorInitial = computed(() => {
  const name = post.value?.author_name ?? ''
  return name ? name.charAt(0).toUpperCase() : 'K'
})

const wasUpdated = computed(() => {
  if (!post.value?.updated_at || !post.value?.published_at) return false
  const updatedDate = new Date(post.value.updated_at)
  const publishedDate = new Date(post.value.published_at)
  if (Number.isNaN(updatedDate.getTime())) {
    console.warn('[wasUpdated] Invalid updated_at date', post.value.updated_at, 'post id:', post.value.id)
    return false
  }
  if (Number.isNaN(publishedDate.getTime())) {
    console.warn('[wasUpdated] Invalid published_at date', post.value.published_at, 'post id:', post.value.id)
    return false
  }
  return Math.abs(updatedDate.getTime() - publishedDate.getTime()) > 60_000
})

function categoryClass(cat: string) {
  return CATEGORY_CLASSES[cat] ?? 'bg-stone-100 text-stone-800'
}

function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

const postMedia = computed(() => resolveMedia({
  public_url: post.value?.public_url,
  kind: post.value?.kind
}))
const ogImage = useSharedOgImage(() => postMedia.value.thumb)

useSeoMeta({
  title: computed(() => post.value ? `${post.value.title} | KrabiClaw Blog` : 'Blog | KrabiClaw'),
  description: computed(() => post.value?.excerpt ?? 'Restaurant tips and insights from KrabiClaw.'),
  ogUrl: computed(() => `${siteUrl}/blog/${route.params.slug}`),
  ogType: 'article',
  ogImage
})
</script>
