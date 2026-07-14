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

type HtmlSanitizer = { sanitize: (_html: string) => string }
const clientSanitizer = shallowRef<HtmlSanitizer | null>(null)

function normalizeTextEntities(html: string) {
  return html.replace(/(^|>)([^<]*)/g, (_, boundary: string, text: string) =>
    boundary + text.replace(/&#39;/g, "'"))
}

const sanitizeContent = (content?: string | null) => {
  const rendered = normalizeTextEntities(renderMarkdownToHtml(content || ''))
  return (clientSanitizer.value || { sanitize: sanitizeHtmlForSsr }).sanitize(rendered)
}

const html = ref(sanitizeContent(props.content))
watch(() => props.content, content => { html.value = sanitizeContent(content) })

onMounted(async () => {
  const { default: DOMPurify } = await import('dompurify')
  clientSanitizer.value = DOMPurify as HtmlSanitizer
  html.value = sanitizeContent(props.content)
})
</script>
