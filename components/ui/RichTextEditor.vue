<template>
  <UEditor
    v-if="mode === 'rich'"
    v-slot="{ editor }"
    :model-value="modelValue"
    content-type="markdown"
    :placeholder="placeholder"
    :editable="editable"
    class="w-full"
    :starter-kit="{ heading: { levels: [2, 3] } }"
    :handlers="customHandlers"
    :ui="{ content: 'p-0', base: 'p-0 sm:px-0' }"
    @update:model-value="value => emit('update:modelValue', String(value ?? ''))"
  >
    <UEditorToolbar v-if="editable" :editor="editor" :items="toolbarItems" layout="bubble" />
    <UEditorSuggestionMenu v-if="editable" :editor="editor" :items="suggestionItems" />
  </UEditor>
  <div v-else class="w-full space-y-2">
    <div v-if="editable" class="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Markdown source formatting">
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Bold" @click="wrapSelection('**', '**', 'bold text')"><strong>B</strong></UButton>
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Italic" @click="wrapSelection('_', '_', 'italic text')"><em>I</em></UButton>
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Link" @click="wrapSelection('[', '](https://)', 'link text')">Link</UButton>
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Heading 2" @click="prefixLines('## ')">H2</UButton>
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Heading 3" @click="prefixLines('### ')">H3</UButton>
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Block quote" @click="prefixLines('> ')">Quote</UButton>
      <UButton size="xs" color="neutral" variant="ghost" aria-label="Bulleted list" @click="prefixLines('- ')">List</UButton>
      <span class="mx-1 h-5 border-l border-default" aria-hidden="true" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-image" @click="splitAtCursorAndInsert('image')">Image</UButton>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-circle-help" @click="splitAtCursorAndInsert('faq')">FAQ</UButton>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-list-ordered" @click="splitAtCursorAndInsert('how_to')">How-To</UButton>
    </div>
    <textarea
      ref="textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :readonly="!editable"
      aria-label="Article Markdown"
      class="field-sizing-content min-h-32 w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-mono text-base leading-7 text-inherit outline-none"
      @input="emitSource"
    />
  </div>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { EditorCustomHandlers, EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui'
import { replaceMarkdownRange, splitMarkdownAt } from '~/utils/markdown-source'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  editable?: boolean
  mode?: 'rich' | 'source'
}>(), {
  modelValue: '',
  placeholder: 'Start writing in Markdown…',
  editable: true,
  mode: 'rich',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'split-insert': [payload: { after: string; blockType: 'image' | 'faq' | 'how_to'; editorMode: 'rich' | 'source' }]
}>()
const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')

function emitSource(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function selection() {
  const element = textarea.value
  if (!element) throw new Error('Markdown source editor is not mounted')
  return { element, start: element.selectionStart, end: element.selectionEnd }
}

function replaceSelection(replacement: string, selectionStart: number, selectionEnd: number) {
  const { element, start, end } = selection()
  emit('update:modelValue', replaceMarkdownRange(props.modelValue, start, end, replacement))
  void nextTick(() => {
    element.focus()
    element.setSelectionRange(selectionStart, selectionEnd)
  })
}

function wrapSelection(prefix: string, suffix: string, placeholder: string) {
  const { start, end } = selection()
  const selected = props.modelValue.slice(start, end) || placeholder
  replaceSelection(`${prefix}${selected}${suffix}`, start + prefix.length, start + prefix.length + selected.length)
}

function prefixLines(prefix: string) {
  const { start, end } = selection()
  const lineStart = props.modelValue.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const selected = props.modelValue.slice(lineStart, end)
  const replacement = selected.split('\n').map(line => `${prefix}${line}`).join('\n')
  replaceSelection(replacement, lineStart + prefix.length, lineStart + replacement.length)
}

function splitAtCursorAndInsert(blockType: 'image' | 'faq' | 'how_to') {
  const { start } = selection()
  const { before, after } = splitMarkdownAt(props.modelValue, start)
  emit('update:modelValue', before)
  emit('split-insert', { after, blockType, editorMode: 'source' })
}

function splitRichTextAtCursor(editor: Editor, blockType: 'image' | 'faq' | 'how_to') {
  const { state } = editor
  const beforeNode = state.doc.cut(0, state.selection.from)
  const afterNode = state.doc.cut(state.selection.from, state.doc.content.size)
  if (!editor.markdown) throw new Error('Markdown editor extension is not available')
  const before = editor.markdown.serialize(beforeNode.toJSON())
  const after = editor.markdown.serialize(afterNode.toJSON()).trim()
  editor.chain().setMeta('addToHistory', false).setContent(before, { contentType: 'markdown' }).run()
  emit('split-insert', { after, blockType, editorMode: 'rich' })
}

const toolbarItems: EditorToolbarItem[][] = [[
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
  { kind: 'link', icon: 'i-lucide-link' },
], [
  { kind: 'heading', level: 2, icon: 'i-lucide-heading-2' },
  { kind: 'heading', level: 3, icon: 'i-lucide-heading-3' },
  { kind: 'blockquote', icon: 'i-lucide-quote' },
]]

const customHandlers = {
  insertStructuralBlock: {
    canExecute: () => true,
    execute: (editor: Editor, item?: { blockType?: 'image' | 'faq' | 'how_to' }) => {
      splitRichTextAtCursor(editor, item?.blockType ?? 'image')
      return editor.chain().focus()
    },
    isActive: () => false,
  },
} satisfies EditorCustomHandlers

const suggestionItems: EditorSuggestionMenuItem<typeof customHandlers>[] = [
  { kind: 'heading', level: 2, label: 'Heading 2', icon: 'i-lucide-heading-2' },
  { kind: 'heading', level: 3, label: 'Heading 3', icon: 'i-lucide-heading-3' },
  { kind: 'blockquote', label: 'Quote', icon: 'i-lucide-quote' },
  { kind: 'bulletList', label: 'Bulleted list', icon: 'i-lucide-list' },
  { kind: 'orderedList', label: 'Numbered list', icon: 'i-lucide-list-ordered' },
  { kind: 'horizontalRule', label: 'Divider', icon: 'i-lucide-minus' },
  { kind: 'insertStructuralBlock', blockType: 'image', label: 'Image', icon: 'i-lucide-image' },
  { kind: 'insertStructuralBlock', blockType: 'faq', label: 'FAQ', icon: 'i-lucide-circle-help' },
  { kind: 'insertStructuralBlock', blockType: 'how_to', label: 'How-To', icon: 'i-lucide-list-ordered' },
]
</script>
