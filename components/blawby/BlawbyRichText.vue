<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    :class="unstyled ? '' : 'prose max-w-none prose-headings:text-[var(--blawby-primary)] prose-p:leading-8 prose-p:text-[var(--blawby-ink)] prose-a:text-[var(--blawby-accent-strong)]'"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import { renderMarkdownToHtml } from '~/utils/markdown'

const props = defineProps<{
  content?: string | null
  unstyled?: boolean
}>()

// `marked` escapes apostrophes and quotes into `&#39;`/`&quot;`; the sanitizer's
// parser decodes them back on the way out, the same on both runtimes.
const html = computed(() => sanitizeHtml(renderMarkdownToHtml(props.content || '')))
</script>
