<template>
  <!-- eslint-disable vue/no-v-html -->
  <div v-html="html" />
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import { renderMarkdownToHtml } from '~/utils/markdown'

/**
 * Markdown from a page document, rendered.
 *
 * The one place a block's markdown becomes HTML: `marked` through
 * `renderMarkdownToHtml`, then `sanitizeHtml` — the same path the blog and the
 * docs take. Carries no prose classes
 * of its own; the block or section that places it says how the text looks. A
 * single paragraph is unwrapped so a one-paragraph description can sit inside
 * the caller's own element.
 */
const props = defineProps<{ content?: string | null }>()

function render(content?: string | null) {
  const sanitized = sanitizeHtml(renderMarkdownToHtml(content || '').trim())
  // One paragraph is the caller's paragraph.
  const single = sanitized.match(/^<p>([\s\S]*)<\/p>$/)
  return single && !single[1]!.includes('<p>') ? single[1]! : sanitized
}

const html = computed(() => render(props.content))
</script>
