<template>
  <div class="mx-auto w-full max-w-sm lg:max-w-[22rem]">
    <button
      type="button"
      class="w-full rounded-[1.25rem] border-2 p-6 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :class="selectedId === 'details' ? selectedClasses : inactiveClasses"
      :aria-pressed="selectedId === 'details'"
      @click="emit('select', 'details', $event.currentTarget)"
    >
      <span class="block text-base font-semibold text-highlighted">Page details</span>
      <span class="mt-3 block truncate text-xl font-semibold leading-tight text-toned">{{ title || 'Untitled page' }}</span>
      <span class="mt-2 block truncate text-sm text-muted">{{ path || 'URL created on save' }} · {{ locale.toUpperCase() }}</span>
      <span v-if="summary" class="mt-3 line-clamp-2 block text-sm leading-5 text-muted">{{ summary }}</span>
    </button>

    <div class="mt-4 space-y-4">
      <article
        v-for="(block, index) in blocks"
        :key="block.id"
        class="overflow-hidden rounded-[1.25rem] border-2 transition"
        :class="selectedId === block.id ? selectedClasses : inactiveClasses"
        :data-block-index="index"
      >
        <button
          type="button"
          class="block w-full focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          :aria-label="`Open ${blockLabel(block)}`"
          :aria-pressed="selectedId === block.id"
          @click="emit('select', block.id, $event.currentTarget)"
        >
          <TenantPageSectionPreview :block="block" />
        </button>
        <div class="flex min-h-11 items-center justify-end border-t border-default px-2" aria-label="Section actions">
          <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="sm" :disabled="disabled || index === 0" :aria-label="`Move ${blockLabel(block)} up`" @click="emit('move', index, -1)" />
          <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="sm" :disabled="disabled || index === blocks.length - 1" :aria-label="`Move ${blockLabel(block)} down`" @click="emit('move', index, 1)" />
          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="sm" :disabled="disabled" :aria-label="`Duplicate ${blockLabel(block)}`" @click="emit('duplicate', index)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :disabled="disabled" :aria-label="`Delete ${blockLabel(block)}`" @click="emit('remove', index)" />
        </div>
      </article>
    </div>

    <div class="mt-6 flex items-center gap-2">
      <USelect v-model="newBlockType" :items="blockTypeOptions" class="min-w-0 flex-1" aria-label="Section type" :disabled="disabled" />
      <UButton icon="i-lucide-plus" label="Add section" :disabled="disabled || !blockTypeOptions.length" @click="emit('add', newBlockType)" />
    </div>

    <p v-if="!blocks.length" class="mt-6 text-center text-sm text-muted">This page has no sections yet.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlock, type TenantPageBlockType } from '~/utils/tenant-page-blocks'

const props = defineProps<{
  title: string
  summary: string
  locale: string
  path: string
  blocks: TenantPageBlock[]
  selectedId: string
  blockTypeOptions: Array<{ label: string, value: TenantPageBlockType }>
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [id: string, trigger: EventTarget | null]
  add: [type: TenantPageBlockType]
  move: [index: number, delta: number]
  duplicate: [index: number]
  remove: [index: number]
}>()

const newBlockType = ref<TenantPageBlockType>('markdown')
const selectedClasses = 'border-primary bg-white shadow-[0_6px_24px_rgba(15,23,42,0.10)] dark:bg-white/[0.06]'
const inactiveClasses = 'border-transparent bg-white shadow-[0_4px_20px_rgba(15,23,42,0.07)] hover:shadow-[0_6px_24px_rgba(15,23,42,0.11)] dark:bg-white/[0.04] dark:shadow-none dark:ring-1 dark:ring-white/10'

watch(() => props.blockTypeOptions, (options) => {
  if (!options.some(option => option.value === newBlockType.value)) newBlockType.value = options[0]?.value ?? 'markdown'
}, { immediate: true })

function blockLabel(block: TenantPageBlock): string {
  return TENANT_PAGE_BLOCK_REGISTRY[block.type].label
}
</script>
