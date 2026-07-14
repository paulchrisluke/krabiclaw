<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    :class="unstyled ? '' : 'prose max-w-none prose-headings:text-[var(--blawby-primary)] prose-p:leading-8 prose-p:text-[var(--blawby-ink)] prose-a:text-[var(--blawby-accent-strong)]'"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'

const props = defineProps<{
  content?: string | null
  unstyled?: boolean
}>()

// Use the browser sanitizer for the initial client render, not only after mount.
// Besides sanitizing, DOMPurify normalizes entities (for example &#39; to ')
// exactly as the browser parses the SSR HTML, preventing false hydration drift.
const DOMPurify = import.meta.client
  ? (await import('isomorphic-dompurify')).default
  : { sanitize: sanitizeHtmlForSsr }

const sanitizeContent = (content?: string | null) => {
  const rendered = renderMarkdownToHtml(content || '')
  return DOMPurify.sanitize(rendered)
}

const html = computed(() => sanitizeContent(props.content))
</script>
