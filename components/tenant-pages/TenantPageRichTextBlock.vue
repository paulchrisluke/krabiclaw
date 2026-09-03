<template>
  <component
    :is="headingTag"
    v-if="block.type === 'heading'"
    class="mt-12 text-3xl font-semibold tracking-tight"
  >
    {{ text(block.data.text) || pageTitle }}
  </component>
  <div
    v-else-if="block.type === 'markdown' && markdown"
    class="prose prose-lg mt-8 max-w-none whitespace-pre-wrap text-muted"
  >
    {{ sanitizer.sanitize(markdown) }}
  </div>
</template>

<script setup lang="ts">
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'

const props = defineProps<{ block: TenantPageBlock; pageTitle: string }>()
const sanitizer = useHtmlSanitizer()

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const markdown = computed(() => text(props.block.data.markdown) || text(props.block.data.content))
const headingTag = computed(() => {
  const level = Number(props.block.data.level)
  return `h${Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2}`
})
</script>
