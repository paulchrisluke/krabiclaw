<template>
  <component
    :is="headingTag"
    v-if="block.type === 'heading' && text(block.data.text)"
    class="mt-12 text-3xl font-semibold tracking-tight"
  >
    {{ text(block.data.text) }}
  </component>
  <TenantPageMarkdown
    v-else-if="block.type === 'markdown' && markdown"
    :content="markdown"
    class="prose prose-lg mt-8 max-w-none text-muted"
  />
</template>

<script setup lang="ts">
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

/**
 * A heading block, or a markdown block rendered as the HTML its markdown
 * describes. It used to interpolate the markdown source into a
 * `whitespace-pre-wrap` div, so `## Heading` and `**bold**` printed literally
 * on every page whose author had written any — and the `prose` classes styled
 * nothing, because there were no elements for them to style.
 *
 * TenantPageMarkdown owns that conversion and its sanitizing, here and for the
 * blog and docs, so this component holds no sanitizer of its own.
 */
const props = defineProps<{ block: TenantPageBlock }>()

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const markdown = computed(() => text(props.block.data.markdown))
const headingTag = computed(() => {
  const level = Number(props.block.level)
  return `h${Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2}`
})
</script>
