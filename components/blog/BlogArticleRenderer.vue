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
        <textarea
          v-if="editable && block.type === 'markdown'"
          :value="textValue(block)"
          class="field-sizing-content min-h-32 w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-mono text-base leading-7 text-inherit outline-none"
          aria-label="Article text"
          placeholder="Start writing in Markdown…"
          @input="updateText(index, block, $event)"
        />
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
        <dl v-else-if="block.type === 'faq' && (editable || isRenderable(block))" class="space-y-5">
          <div v-for="(item, itemIndex) in faqItems(block)" :key="itemIndex">
            <dt class="font-semibold">Q: {{ item.question }}</dt>
            <dd class="mt-1 opacity-80">A: {{ item.answer }}</dd>
          </div>
          <slot v-if="editable" name="faq-editor" :block="block" :index="index" />
        </dl>
        <ol v-else-if="block.type === 'how_to' && (editable || isRenderable(block))" class="list-decimal space-y-2 pl-6 text-lg leading-8">
          <li v-for="(step, stepIndex) in howToSteps(block)" :key="stepIndex">{{ step.text || step.name }}</li>
          <slot v-if="editable" name="how-to-editor" :block="block" :index="index" />
        </ol>
        <div v-else-if="block.type === 'gallery'" class="grid gap-4 sm:grid-cols-2">
          <figure v-for="(item, itemIndex) in galleryItems(block)" :key="item.id || itemIndex" class="space-y-2">
            <img v-if="item.public_url || item.thumbnail_url" :src="String(item.public_url || item.thumbnail_url)" :alt="String(item.alt || '')" class="aspect-video w-full rounded-lg object-cover">
            <figcaption v-if="item.caption" class="text-sm opacity-70">{{ item.caption }}</figcaption>
          </figure>
        </div>
        <ContentAiAssistanceSection v-else-if="block.type === 'ai_assistance' && aiAssistanceProps(block)" v-bind="aiAssistanceProps(block)!" />
        <aside v-else-if="block.type === 'callout'" class="rounded-xl border border-current/15 bg-current/5 p-5">
          <h3 v-if="block.data.title" class="mb-2 font-semibold">{{ block.data.title }}</h3>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="prose max-w-none" v-html="renderMarkdown(String(block.data.markdown || block.data.text || ''))" />
        </aside>
        <div v-else-if="block.type === 'cta'" class="rounded-xl border border-current/15 p-6 text-center">
          <h3 v-if="block.data.title" class="text-xl font-semibold">{{ block.data.title }}</h3>
          <p v-if="block.data.description" class="mt-2 opacity-75">{{ block.data.description }}</p>
          <a v-if="safeUrl(block.data.url)" :href="safeUrl(block.data.url)!" class="mt-4 inline-flex rounded-lg bg-current px-4 py-2 font-semibold text-white no-underline"><span class="mix-blend-difference">{{ block.data.label || 'Learn more' }}</span></a>
        </div>
        <hr v-else-if="block.type === 'divider'" class="border-current opacity-20">
        <div v-else-if="editable" class="rounded-lg border border-dashed border-current/20 p-4 text-sm opacity-70">
          {{ block.type.replaceAll('_', ' ') }} block
        </div>
        <slot v-if="editable" name="block-actions" :block="block" :index="index" />
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { BlogEditorBlock } from '~/components/workspace/blog/types'
import ContentAiAssistanceSection from '~/components/content/ContentAiAssistanceSection.vue'
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { sanitizeUrl } from '~/utils/sanitize'

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
function faqItems(block: BlogEditorBlock) { return Array.isArray(block.data.items) ? block.data.items as Array<{ question?: string; answer?: string }> : [] }
function howToSteps(block: BlogEditorBlock) { return Array.isArray(block.data.steps) ? block.data.steps as Array<{ name?: string; text?: string }> : [] }
function isRenderable(block: BlogEditorBlock) { return block.data.status !== 'inactive' && block.data.render_enabled !== false }
function galleryItems(block: BlogEditorBlock) { return Array.isArray(block.data.items) ? block.data.items as Array<{ id?: string; public_url?: string; thumbnail_url?: string; alt?: string; caption?: string }> : [] }
function safeUrl(value: unknown) { return sanitizeUrl(typeof value === 'string' ? value : null) }
function aiAssistanceProps(block: BlogEditorBlock) {
  if (block.data.render_enabled === false || block.data.status === 'inactive') return null
  const prompts = Array.isArray(block.data.prompts) ? block.data.prompts : []
  const normalized = prompts.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const prompt = item as Record<string, unknown>
    if (typeof prompt.prompt !== 'string' || !prompt.prompt.trim()) return []
    return [{ title: typeof prompt.title === 'string' ? prompt.title : null, prompt: prompt.prompt, description: typeof prompt.description === 'string' ? prompt.description : null, copyLabel: typeof prompt.copy_label === 'string' ? prompt.copy_label : 'Copy prompt' }]
  })
  return normalized.length ? { label: typeof block.data.label === 'string' ? block.data.label : 'AI Assistance', intro: typeof block.data.intro === 'string' ? block.data.intro : null, prompts: normalized } : null
}
</script>

<style scoped>
.blog-article-renderer[data-template="blawby"] { color: var(--blawby-ink, #263238); font-family: var(--blawby-font-body, inherit); }
.blog-article-renderer[data-template="saya"] { color: var(--ui-text, inherit); }
</style>
