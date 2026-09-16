<template>
  <!-- eslint-disable vue/no-v-html -->
  <div v-html="html" />
  <!-- eslint-enable vue/no-v-html -->
</template>

<script setup lang="ts">
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { loadDomPurify } from '~/utils/dom-purify-loader'

/**
 * Markdown from a page document, rendered.
 *
 * The one place a block's markdown becomes HTML: `marked` through
 * `renderMarkdownToHtml`, the SSR sanitizer until DOMPurify has loaded in the
 * browser — the same path the blog and the docs take. Carries no prose classes
 * of its own; the block or section that places it says how the text looks. A
 * single paragraph is unwrapped so a one-paragraph description can sit inside
 * the caller's own element.
 */
const props = defineProps<{ content?: string | null }>()

type HtmlSanitizer = { sanitize: (_html: string) => string }
const clientSanitizer = shallowRef<HtmlSanitizer | null>(null)

function render(content?: string | null) {
  const rendered = renderMarkdownToHtml(content || '').trim()
  const sanitized = (clientSanitizer.value || { sanitize: sanitizeHtmlForSsr }).sanitize(rendered)
  // One paragraph is the caller's paragraph.
  const single = sanitized.match(/^<p>([\s\S]*)<\/p>$/)
  return single && !single[1]!.includes('<p>') ? single[1]! : sanitized
}

const html = ref(render(props.content))
watch(() => props.content, content => { html.value = render(content) })
onMounted(async () => {
  clientSanitizer.value = await loadDomPurify()
  html.value = render(props.content)
})
</script>
