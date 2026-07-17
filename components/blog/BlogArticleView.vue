<template>
  <article class="blog-article-view min-w-0" :data-template="template">
    <header v-if="showHeader" class="blog-article-header mb-10">
      <div v-if="showMeta" class="mb-4 flex flex-wrap items-center gap-3 text-sm opacity-70">
        <span v-if="category" class="rounded bg-current/10 px-2 py-1 text-xs font-semibold">{{ category }}</span>
        <time v-if="publishedAt" :datetime="publishedAt">{{ formatDate(publishedAt) }}</time>
        <span v-if="readMinutes">{{ readMinutes }} min read</span>
        <time v-if="updatedAt && updatedAt !== publishedAt" :datetime="updatedAt">Updated {{ formatDate(updatedAt) }}</time>
      </div>
      <textarea v-if="editable" :value="title" rows="1" class="field-sizing-content w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-4xl font-bold leading-tight text-inherit outline-none sm:text-5xl" aria-label="Post title" placeholder="Post title" @input="$emit('update:title', ($event.target as HTMLTextAreaElement).value)" @keydown.enter.prevent />
      <h1 v-else class="text-4xl font-bold leading-tight sm:text-5xl">{{ title }}</h1>
      <p v-if="excerpt" class="mt-5 text-xl leading-relaxed opacity-75">{{ excerpt }}</p>
      <div v-if="showMeta && (authorName || $slots.author || $slots.share)" class="mt-7 flex flex-wrap items-center justify-between gap-4 border-y border-current/15 py-4">
        <slot name="author">
          <div class="flex items-center gap-3">
            <img v-if="authorImage" :src="authorImage" :alt="authorName || ''" class="size-11 rounded-full object-cover">
            <span v-else class="grid size-11 place-items-center rounded-full bg-current/10 text-sm font-semibold">{{ authorInitials }}</span>
            <div><p class="font-semibold">{{ authorName }}</p><p v-if="siteName" class="text-sm opacity-65">Published from {{ siteName }}</p></div>
          </div>
        </slot>
        <slot name="share" />
      </div>
      <video v-if="mediaUrl && mediaKind === 'video'" :src="mediaUrl" autoplay muted loop playsinline class="mt-8 aspect-video w-full rounded-2xl object-cover" />
      <img v-else-if="mediaUrl" :src="mediaUrl" :alt="title" class="mt-8 aspect-video w-full rounded-2xl object-cover">
    </header>

    <BlogArticleRenderer
      v-if="normalizedBlocks.length"
      :title="title"
      :blocks="normalizedBlocks"
      :editable="editable"
      :template="template"
      :show-title="!showHeader"
      class="max-w-none! px-0! py-0!"
      @update:title="$emit('update:title', $event)"
      @update:block="(index, block) => $emit('update:block', index, block)"
      @insert-block="(index, cursorPosition) => $emit('insert-block', index, cursorPosition)"
      @insert-block-type="(index, type) => $emit('insert-block-type', index, type)"
      @merge-block="(index, direction) => $emit('merge-block', index, direction)"
      @split-insert="(index, payload) => $emit('split-insert', index, payload)"
    >
      <template #image-editor="slotProps"><slot name="image-editor" v-bind="slotProps" /></template>
    </BlogArticleRenderer>
    <slot v-else name="legacy-body" />
    <slot name="footer" />
  </article>
</template>

<script setup lang="ts">
import type { BlogEditorBlock } from '~/components/workspace/blog/types'

const props = withDefaults(defineProps<{
  title: string
  excerpt?: string | null
  category?: string | null
  publishedAt?: string | null
  updatedAt?: string | null
  authorName?: string | null
  authorImage?: string | null
  siteName?: string | null
  mediaUrl?: string | null
  mediaKind?: string | null
  readMinutes?: number | null
  blocks?: BlogEditorBlock[] | null
  editable?: boolean
  template?: 'saya' | 'blawby' | 'platform' | string
  showHeader?: boolean
  showMeta?: boolean
}>(), { excerpt: null, category: null, publishedAt: null, updatedAt: null, authorName: null, authorImage: null, siteName: null, mediaUrl: null, mediaKind: null, readMinutes: null, blocks: () => [], editable: false, template: 'saya', showHeader: true, showMeta: true })

defineEmits<{ 'update:title': [value: string]; 'update:block': [index: number, block: BlogEditorBlock]; 'insert-block': [index: number, cursorPosition: number]; 'insert-block-type': [index: number, type: string]; 'merge-block': [index: number, direction: 'back' | 'forward']; 'split-insert': [index: number, payload: { after: string; blockType: 'image' | 'faq' | 'how_to' }] }>()

const authorInitials = computed(() => String(props.authorName || props.siteName || 'A').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())
const normalizedBlocks = computed(() => props.blocks ?? [])
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value)) }
</script>

<style scoped>
.blog-article-view[data-template="blawby"] { color: var(--blawby-ink, #263238); font-family: var(--blawby-font-body, inherit); }
.blog-article-view[data-template="blawby"] .blog-article-header h1 { color: var(--blawby-primary, currentColor); }
</style>
