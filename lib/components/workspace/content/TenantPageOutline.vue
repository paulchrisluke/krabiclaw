<template>
  <div class="mx-auto w-full max-w-sm lg:max-w-[22rem]">
    <EditorNavigationList :groups="navigationGroups" :active-item="selectedId" variant="cards" @select="selectItem">
      <template #item="{ item }">
        <span v-if="item.id === 'details'" class="block p-6">
          <span class="block text-base font-semibold text-highlighted">Page details</span>
          <span class="mt-3 block truncate text-xl font-semibold leading-tight text-toned">{{ title || 'Untitled page' }}</span>
          <span class="mt-2 block truncate text-sm text-muted">{{ path || 'URL created on save' }} · {{ locale.toUpperCase() }}</span>
          <span v-if="summary" class="mt-3 line-clamp-2 block text-sm leading-5 text-muted">{{ summary }}</span>
        </span>
        <TenantPageSectionPreview v-else-if="previewBlockFor(item.id)" :block="previewBlockFor(item.id)!" />
      </template>

      <template #actions="{ item, index }">
        <template v-if="item.id !== 'details'">
          <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="sm" :disabled="disabled || index === 1" :aria-label="`Move ${item.label} up`" @click="emit('move', index - 1, -1)" />
          <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="sm" :disabled="disabled || index === blocks.length" :aria-label="`Move ${item.label} down`" @click="emit('move', index - 1, 1)" />
          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="sm" :disabled="disabled" :aria-label="`Duplicate ${item.label}`" @click="emit('duplicate', index - 1)" />
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :disabled="disabled" :aria-label="`Delete ${item.label}`" @click="emit('remove', index - 1)" />
        </template>
      </template>
    </EditorNavigationList>

    <div class="mt-6 flex items-center gap-2">
      <USelect v-model="newBlockType" :items="blockTypeOptions" class="min-w-0 flex-1" aria-label="Section type" :disabled="disabled" />
      <UButton icon="i-lucide-plus" label="Add section" :disabled="disabled || !blockTypeOptions.length" @click="emit('add', newBlockType)" />
    </div>

    <p v-if="!blocks.length" class="mt-6 text-center text-sm text-muted">This page has no sections yet.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { TENANT_PAGE_BLOCK_REGISTRY, type TenantPageBlock, type TenantPageBlockType } from '~/utils/tenant-page-blocks'

const props = defineProps<{
  title: string
  summary: string
  locale: string
  path: string
  blocks: TenantPageBlock[]
  previewBlocks?: TenantPageBlock[]
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
const navigationGroups = computed<EditorNavigationGroup[]>(() => [{
  id: 'page-sections',
  items: [
    { id: 'details', label: 'Page details' },
    ...props.blocks.map(block => ({ id: block.id, label: blockLabel(block), actions: true })),
  ],
}])

watch(() => props.blockTypeOptions, (options) => {
  if (!options.some(option => option.value === newBlockType.value)) newBlockType.value = options[0]?.value ?? 'markdown'
}, { immediate: true })

function blockLabel(block: TenantPageBlock): string {
  return TENANT_PAGE_BLOCK_REGISTRY[block.type].label
}

function previewBlockFor(id: string): TenantPageBlock | undefined {
  return props.previewBlocks?.find(block => block.id === id) ?? props.blocks.find(block => block.id === id)
}

function selectItem(id: string, trigger: EventTarget | null) {
  emit('select', id, trigger)
}
</script>
