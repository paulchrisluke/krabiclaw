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

    <div class="space-y-4">
      <template v-for="(block, index) in blocks" :key="block.id || index">
        <section class="group relative">
          <div v-if="editable" class="absolute right-full top-0 mr-2 flex items-center gap-1">
            <button class="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/30 bg-transparent hover:bg-current/5 disabled:opacity-30" :disabled="index === 0" aria-label="Move block up" @click="$emit('move-block', index, -1)">
              <UIcon name="i-lucide-chevron-up" class="size-4" />
            </button>
            <button class="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/30 bg-transparent hover:bg-current/5 disabled:opacity-30" :disabled="index === blocks.length - 1" aria-label="Move block down" @click="$emit('move-block', index, 1)">
              <UIcon name="i-lucide-chevron-down" class="size-4" />
            </button>
            <button class="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/30 hover:border-current/50 hover:bg-current/5 bg-transparent" aria-label="Remove block" @click="$emit('merge-block', index, index === 0 ? 'forward' : 'back')">
              <UIcon name="i-lucide-trash-2" class="size-4" />
            </button>
            <UPopover v-model:open="inserterOpenLocal[index]">
              <button class="flex size-8 shrink-0 items-center justify-center rounded-full border border-current/30 hover:border-current/50 bg-transparent" aria-label="Insert block">
                <UIcon name="i-lucide-plus" class="size-4" />
              </button>
              <template #content>
                <div class="flex gap-1 p-1">
                  <button v-for="item in inserterItems" :key="item.type" class="flex flex-col items-center gap-1 rounded px-3 py-2 text-sm text-default hover:bg-elevated" @click="$emit('insert-block-type', index, item.type)">
                    <UIcon :name="item.icon" class="size-4" />
                    <span class="text-xs">{{ item.label }}</span>
                  </button>
                </div>
              </template>
            </UPopover>
          </div>
        <RichTextEditor
          v-if="editable && block.type === 'markdown'"
          :model-value="textValue(block)"
          :mode="block.data.editor_mode === 'source' ? 'source' : 'rich'"
          class="text-base leading-7"
          @update:model-value="value => updateMarkdown(index, block, value)"
          @split-insert="payload => $emit('split-insert', index, payload)"
        />
        <textarea
          v-else-if="editable && block.type === 'heading'"
          :value="textValue(block)"
          aria-label="Heading"
          class="field-sizing-content min-h-12 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-lg leading-8 text-inherit outline-none"
          :class="'text-2xl font-semibold sm:text-3xl'"
          @input="updateText(index, block, $event)"
          @keydown.enter="handleEnterKey(index, $event)"
          @keydown.backspace="handleBackspace(index, $event)"
          @keydown.delete="handleDelete(index, $event)"
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
        <div v-else-if="block.type === 'faq' && editable" class="space-y-3">
          <div v-for="(item, itemIndex) in faqItems(block)" :key="itemIndex" class="space-y-2 rounded-lg border border-default p-3">
            <div class="flex items-start gap-2">
              <div class="flex-1 space-y-2">
                <UInput :model-value="item.question || ''" placeholder="Question" class="w-full" @update:model-value="value => updateFaqItem(index, itemIndex, 'question', String(value))" />
                <UTextarea :model-value="item.answer || ''" :rows="2" placeholder="Answer" class="w-full" @update:model-value="value => updateFaqItem(index, itemIndex, 'answer', String(value))" />
              </div>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Remove question" @click="removeFaqItem(index, itemIndex)" />
            </div>
          </div>
          <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addFaqItem(index)">Add question</UButton>
        </div>
        <dl v-else-if="block.type === 'faq' && isRenderable(block)" class="space-y-5">
          <div v-for="(item, itemIndex) in faqItems(block)" :key="itemIndex">
            <dt class="font-semibold">Q: {{ item.question }}</dt>
            <dd class="mt-1 opacity-80">A: {{ item.answer }}</dd>
          </div>
        </dl>
        <div v-else-if="block.type === 'how_to' && editable" class="space-y-2">
          <div v-for="(step, stepIndex) in howToSteps(block)" :key="stepIndex" class="flex items-center gap-2">
            <span class="w-5 shrink-0 text-right text-sm opacity-60">{{ stepIndex + 1 }}.</span>
            <UInput :model-value="step.text || step.name || ''" placeholder="Step" class="w-full flex-1" @update:model-value="value => updateHowToStep(index, stepIndex, String(value))" />
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" aria-label="Remove step" @click="removeHowToStep(index, stepIndex)" />
          </div>
          <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" @click="addHowToStep(index)">Add step</UButton>
        </div>
        <ol v-else-if="block.type === 'how_to' && isRenderable(block)" class="list-decimal space-y-2 pl-6 text-lg leading-8">
          <li v-for="(step, stepIndex) in howToSteps(block)" :key="stepIndex">{{ step.text || step.name }}</li>
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
        </section>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { BlogEditorBlock } from '~/components/workspace/blog/types'
import ContentAiAssistanceSection from '~/components/content/ContentAiAssistanceSection.vue'
import { renderMarkdownToHtml, sanitizeHtmlForSsr } from '~/utils/markdown'
import { sanitizeUrl } from '~/utils/sanitize'

const props = withDefaults(defineProps<{ title: string; blocks: BlogEditorBlock[]; editable?: boolean; template?: string; showTitle?: boolean }>(), {
  editable: false,
  template: 'saya',
  showTitle: true,
})
const emit = defineEmits<{ 'update:title': [value: string]; 'update:block': [index: number, block: BlogEditorBlock]; 'insert-block': [index: number, cursorPosition: number]; 'insert-block-type': [index: number, type: string]; 'move-block': [index: number, delta: -1 | 1]; 'merge-block': [index: number, direction: 'back' | 'forward']; 'split-insert': [index: number, payload: { after: string; blockType: 'image' | 'faq' | 'how_to'; editorMode: 'rich' | 'source' }] }>()
const inserterOpenLocal = ref<Record<number, boolean>>({})
const inserterItems = [
  { type: 'image', label: 'Image', icon: 'i-lucide-image' },
  { type: 'faq', label: 'FAQ', icon: 'i-lucide-circle-help' },
  { type: 'how_to', label: 'How-To', icon: 'i-lucide-list-ordered' },
  { type: 'divider', label: 'Divider', icon: 'i-lucide-minus' },
] as const
function isBlockEmpty(block: BlogEditorBlock) {
  if (block.type === 'markdown' || block.type === 'heading') {
    const text = String(block.data[block.type === 'heading' ? 'text' : 'markdown'] || '')
    return !text.trim()
  }
  return false
}
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: sanitizeHtmlForSsr }
function renderMarkdown(value: string) { return DOMPurify.sanitize(renderMarkdownToHtml(value)) }
function textValue(block: BlogEditorBlock) { return String(block.data[block.type === 'heading' ? 'text' : 'markdown'] || '') }
function updateText(index: number, block: BlogEditorBlock, event: Event) {
  const key = block.type === 'heading' ? 'text' : 'markdown'
  emit('update:block', index, { ...block, data: { ...block.data, [key]: (event.target as HTMLTextAreaElement).value } })
}
function updateMarkdown(index: number, block: BlogEditorBlock, value: string) {
  emit('update:block', index, { ...block, data: { ...block.data, markdown: value } })
}
function handleEnterKey(index: number, event: KeyboardEvent) {
  if (event.shiftKey) return
  emit('insert-block', index, 0)
  event.preventDefault()
}
function handleBackspace(index: number, event: KeyboardEvent) {
  const block = props.blocks[index]
  if (block && isBlockEmpty(block)) {
    emit('merge-block', index, 'back')
    event.preventDefault()
  }
}
function handleDelete(index: number, event: KeyboardEvent) {
  const block = props.blocks[index]
  if (block && isBlockEmpty(block)) {
    emit('merge-block', index, 'forward')
    event.preventDefault()
  }
}
function faqItems(block: BlogEditorBlock) { return Array.isArray(block.data.items) ? block.data.items as Array<{ question?: string; answer?: string }> : [] }
function howToSteps(block: BlogEditorBlock) { return Array.isArray(block.data.steps) ? block.data.steps as Array<{ name?: string; text?: string }> : [] }
function updateFaqItem(index: number, itemIndex: number, key: 'question' | 'answer', value: string) {
  const block = props.blocks[index]
  if (!block) return
  const items = faqItems(block).map((item, i) => i === itemIndex ? { ...item, [key]: value } : item)
  emit('update:block', index, { ...block, data: { ...block.data, items } })
}
function addFaqItem(index: number) {
  const block = props.blocks[index]
  if (!block) return
  emit('update:block', index, { ...block, data: { ...block.data, items: [...faqItems(block), { question: '', answer: '' }] } })
}
function removeFaqItem(index: number, itemIndex: number) {
  const block = props.blocks[index]
  if (!block) return
  const items = faqItems(block).filter((_, i) => i !== itemIndex)
  emit('update:block', index, { ...block, data: { ...block.data, items: items.length ? items : [{ question: '', answer: '' }] } })
}
function updateHowToStep(index: number, stepIndex: number, value: string) {
  const block = props.blocks[index]
  if (!block) return
  const steps = howToSteps(block).map((step, i) => i === stepIndex ? { ...step, text: value } : step)
  emit('update:block', index, { ...block, data: { ...block.data, steps } })
}
function addHowToStep(index: number) {
  const block = props.blocks[index]
  if (!block) return
  emit('update:block', index, { ...block, data: { ...block.data, steps: [...howToSteps(block), { text: '' }] } })
}
function removeHowToStep(index: number, stepIndex: number) {
  const block = props.blocks[index]
  if (!block) return
  const steps = howToSteps(block).filter((_, i) => i !== stepIndex)
  emit('update:block', index, { ...block, data: { ...block.data, steps: steps.length ? steps : [{ text: '' }] } })
}
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
