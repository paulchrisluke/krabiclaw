<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    class="prose max-w-none prose-headings:text-[var(--blawby-primary)] prose-p:leading-8 prose-p:text-[var(--blawby-ink)] prose-a:text-[var(--blawby-accent-strong)]"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'

const props = defineProps<{
  content?: string | null
}>()

const html = computed(() => sanitizeHtmlForSsr(renderMarkdownToHtml(props.content || '')))
</script>
