<template>
  <component
    :is="headingTag"
    v-if="block.type === 'heading'"
    class="mt-12 text-3xl font-semibold tracking-tight"
  >
    {{ text(block.data.text) || pageTitle }}
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
 */
const props = defineProps<{ block: TenantPageBlock; pageTitle: string }>()

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const markdown = computed(() => text(props.block.data.markdown) || text(props.block.data.content))
const headingTag = computed(() => {
  const level = Number(props.block.data.level)
  return `h${Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2}`
})
</script>
