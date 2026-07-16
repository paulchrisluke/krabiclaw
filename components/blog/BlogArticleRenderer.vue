<template>
  <article class="blog-article-renderer mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14" :data-template="template">
    <input
      v-if="editable && showTitle"
      :value="title"
      class="mb-8 w-full border-0 bg-transparent p-0 text-4xl font-bold leading-tight text-inherit outline-none sm:text-5xl"
      aria-label="Post title"
      placeholder="Post title"
      @input="$emit('update:title', ($event.target as HTMLInputElement).value)"
    >
    <h1 v-else-if="showTitle" class="mb-8 text-4xl font-bold leading-tight sm:text-5xl">{{ title }}</h1>

    <div class="space-y-8">
      <section v-for="(block, index) in blocks" :key="block.id || index" class="group relative">
        <!-- eslint-disable vue/no-v-html -->
        <div
          v-if="editable && block.type === 'markdown'"
          class="prose prose-lg min-h-12 max-w-none outline-none dark:prose-invert"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          aria-label="Article text"
          data-placeholder="Start writing…"
          v-html="renderMarkdown(String(block.data.markdown || ''))"
          @input="updateRichText(index, block, $event)"
        />
        <!-- eslint-enable vue/no-v-html -->
        <textarea
          v-else-if="editable && block.type === 'heading'"
          :value="textValue(block)"
          aria-label="Heading"
          class="field-sizing-content min-h-12 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-lg leading-8 text-inherit outline-none"
          :class="'text-2xl font-semibold sm:text-3xl'"
          placeholder="Heading"
          @input="updateText(index, block, $event)"
        />
        <!-- eslint-disable vue/no-v-html -->
        <div v-else-if="block.type === 'markdown'" class="prose prose-lg max-w-none dark:prose-invert" v-html="renderMarkdown(String(block.data.markdown || ''))" />
        <!-- eslint-enable vue/no-v-html -->
        <component :is="`h${Math.max(2, Math.min(6, block.level || 2))}`" v-else-if="block.type === 'heading'" class="text-2xl font-semibold">
          {{ block.data.text }}
        </component>
        <figure v-else-if="block.type === 'image'" class="space-y-3">
          <img v-if="block.data.public_url" :src="String(block.data.public_url)" :alt="String(block.data.alt || '')" class="max-h-[70vh] w-full object-cover">
          <div v-else class="flex min-h-48 items-center justify-center bg-black/5 text-sm opacity-70">Choose an image</div>
          <figcaption v-if="block.data.caption" class="text-center text-sm opacity-70">{{ block.data.caption }}</figcaption>
          <slot v-if="editable" name="image-editor" :block="block" :index="index" />
        </figure>
        <dl v-else-if="block.type === 'faq'" class="space-y-5">
          <div v-for="(item, itemIndex) in faqItems(block)" :key="itemIndex">
            <dt class="font-semibold">Q: {{ item.question }}</dt>
            <dd class="mt-1 opacity-80">A: {{ item.answer }}</dd>
          </div>
          <slot v-if="editable" name="faq-editor" :block="block" :index="index" />
        </dl>
        <ol v-else-if="block.type === 'how_to'" class="list-decimal space-y-2 pl-6 text-lg leading-8">
          <li v-for="(step, stepIndex) in howToSteps(block)" :key="stepIndex">{{ step.text || step.name }}</li>
          <slot v-if="editable" name="how-to-editor" :block="block" :index="index" />
        </ol>
        <hr v-else-if="block.type === 'divider'" class="border-current opacity-20">
        <div v-else class="rounded-lg border border-dashed border-current/20 p-4 text-sm opacity-70">
          {{ block.type.replaceAll('_', ' ') }} block
        </div>
        <slot v-if="editable" name="block-actions" :block="block" :index="index" />
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { BlogEditorBlock } from '~/components/workspace/blog/types'
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'

withDefaults(defineProps<{ title: string; blocks: BlogEditorBlock[]; editable?: boolean; template?: string; showTitle?: boolean }>(), {
  editable: false,
  template: 'saya',
  showTitle: true,
})
const emit = defineEmits<{ 'update:title': [value: string]; 'update:block': [index: number, block: BlogEditorBlock] }>()
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }
function renderMarkdown(value: string) { return DOMPurify.sanitize(renderMarkdownToHtml(value)) }
function textValue(block: BlogEditorBlock) { return String(block.data[block.type === 'heading' ? 'text' : 'markdown'] || '') }
function updateText(index: number, block: BlogEditorBlock, event: Event) {
  const key = block.type === 'heading' ? 'text' : 'markdown'
  emit('update:block', index, { ...block, data: { ...block.data, [key]: (event.target as HTMLTextAreaElement).value } })
}
function updateRichText(index: number, block: BlogEditorBlock, event: Event) {
  const root = event.currentTarget as HTMLElement
  emit('update:block', index, { ...block, data: { ...block.data, markdown: htmlToMarkdown(root).trim() } })
}
function htmlToMarkdown(root: HTMLElement) {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
    if (!(node instanceof HTMLElement)) return ''
    const content = Array.from(node.childNodes).map(walk).join('')
    const tag = node.tagName.toLowerCase()
    if (tag === 'br') return '\n'
    if (tag === 'strong' || tag === 'b') return `**${content}**`
    if (tag === 'em' || tag === 'i') return `*${content}*`
    if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`
    if (tag === 'li') return `${content.trim()}\n`
    if (tag === 'ul') return Array.from(node.children).map(child => `- ${walk(child).trim()}\n`).join('') + '\n'
    if (tag === 'ol') return Array.from(node.children).map((child, index) => `${index + 1}. ${walk(child).trim()}\n`).join('') + '\n'
    if (tag === 'p' || tag === 'div') return `${content.trim()}\n\n`
    return content
  }
  return Array.from(root.childNodes).map(walk).join('').replace(/\n{3,}/g, '\n\n')
}
function faqItems(block: BlogEditorBlock) { return Array.isArray(block.data.items) ? block.data.items as Array<{ question?: string; answer?: string }> : [] }
function howToSteps(block: BlogEditorBlock) { return Array.isArray(block.data.steps) ? block.data.steps as Array<{ name?: string; text?: string }> : [] }
</script>

<style scoped>
.blog-article-renderer[data-template="blawby"] { color: var(--blawby-ink, #263238); font-family: var(--blawby-font-body, inherit); }
.blog-article-renderer[data-template="saya"] { color: var(--ui-text, inherit); }
[contenteditable="true"]:empty::before { content: attr(data-placeholder); opacity: .55; }
</style>
