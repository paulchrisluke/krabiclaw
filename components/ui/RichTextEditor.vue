<template>
  <UEditor
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
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { EditorCustomHandlers, EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui'

withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  editable?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Start writing…',
  editable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'split-insert': [payload: { after: string; blockType: 'image' | 'faq' | 'how_to' }]
}>()

// Selection-triggered bubble toolbar, not a fixed always-visible bar.
// H1 is reserved for the post title (set outside this editor), so it's
// excluded here — starter-kit above also caps heading levels to 2/3 so
// typing "# " can't produce an in-body H1. Lists aren't included as
// buttons: StarterKit's input rules already infer them from typing
// "- "/"1. " at the start of a line, matching Notion/Medium behavior.
const toolbarItems: EditorToolbarItem[][] = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic' },
    { kind: 'link', icon: 'i-lucide-link' },
  ],
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3' },
    { kind: 'blockquote', icon: 'i-lucide-quote' },
  ],
]

// Image/FAQ/How-To are our own structural block types living entirely outside
// this rich-text doc's schema — inserting one mid-paragraph means cutting the
// current ProseMirror doc in two at the cursor, keeping "before" as this
// block's own content and handing "after" to the parent to become a new
// markdown block placed after the new structural block.
//
// Node.cut() gives exact node trees for each half (not just text), so
// formatting on either side of the cut is preserved. The pinned Markdown
// extension serializes both nodes directly. Only the "before" Markdown is
// loaded back into the editor, which emits the persisted truncation without
// adding the structural split to Tiptap's local undo history.
function splitAtCursorAndInsert(editor: Editor, blockType: 'image' | 'faq' | 'how_to') {
  const { state } = editor
  const pos = state.selection.from
  const docSize = state.doc.content.size
  const beforeNode = state.doc.cut(0, pos)
  const afterNode = state.doc.cut(pos, docSize)
  if (!editor.markdown) throw new Error('Markdown editor extension is not available')

  const before = editor.markdown.serialize(beforeNode.toJSON())
  const after = editor.markdown.serialize(afterNode.toJSON()).trim()
  editor.chain()
    .setMeta('addToHistory', false)
    .setContent(before, { contentType: 'markdown' })
    .run()

  emit('split-insert', { after, blockType })
}

const customHandlers = {
  insertStructuralBlock: {
    canExecute: () => true,
    execute: (editor: Editor, item?: { blockType?: 'image' | 'faq' | 'how_to' }) => {
      splitAtCursorAndInsert(editor, item?.blockType ?? 'image')
      return editor.chain().focus()
    },
    isActive: () => false,
  },
} satisfies EditorCustomHandlers

// Type "/" anywhere in the body to insert one of these at the cursor — matches
// Notion/Medium's real UX, unlike the gutter "+" which only ever inserts at a
// top-level block's edge.
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
