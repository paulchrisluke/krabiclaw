<template>
  <div class="overflow-hidden text-left">
    <div v-if="preview.kind === 'hero'" class="relative min-h-40 overflow-hidden">
      <img v-if="preview.imageUrl" :src="preview.imageUrl" :alt="preview.imageAlt" class="absolute inset-0 size-full object-cover">
      <div v-if="preview.imageUrl" class="absolute inset-0 bg-black/55" />
      <div class="relative flex min-h-40 flex-col justify-end p-6" :class="preview.imageUrl ? 'text-white' : 'text-highlighted'">
        <span v-if="preview.eyebrow" class="text-[10px] font-bold uppercase tracking-[0.16em]" :class="preview.imageUrl ? 'text-white/70' : 'text-muted'">{{ preview.eyebrow }}</span>
        <span class="mt-2 font-display text-2xl font-bold leading-tight">{{ preview.title }}</span>
        <span v-if="preview.body" class="mt-2 line-clamp-2 text-sm leading-5" :class="preview.imageUrl ? 'text-white/80' : 'text-muted'">{{ preview.body }}</span>
      </div>
    </div>

    <div v-else-if="preview.kind === 'action'" class="p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ preview.label }}</span>
      <span class="mt-5 inline-flex min-h-10 max-w-full items-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">
        <span class="truncate">{{ preview.title }}</span>
      </span>
      <span v-if="preview.body" class="mt-3 line-clamp-2 block text-sm leading-5 text-muted">{{ preview.body }}</span>
    </div>

    <div v-else-if="preview.kind === 'media'">
      <div v-if="preview.imageUrls.length" class="grid aspect-[16/9] w-full grid-cols-2 gap-0.5 overflow-hidden bg-muted" :class="preview.imageUrls.length === 1 ? 'grid-cols-1' : ''">
        <img v-for="(url, index) in preview.imageUrls" :key="url" :src="url" :alt="index === 0 ? preview.imageAlt : ''" class="size-full min-h-0 object-cover">
      </div>
      <div v-else class="grid aspect-[16/9] w-full place-items-center bg-muted text-sm text-muted">No image selected</div>
      <div class="flex items-center justify-between gap-4 px-4 py-3">
        <span class="text-sm font-semibold text-highlighted">{{ preview.caption || preview.label }}</span>
        <span v-if="preview.imageUrls.length > 1" class="text-xs text-muted">{{ preview.imageUrls.length }} images</span>
      </div>
    </div>

    <div v-else-if="preview.kind === 'text'" class="p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ preview.label }}</span>
      <span v-if="preview.title" class="mt-4 block font-display text-2xl font-bold leading-tight text-highlighted">{{ preview.title }}</span>
      <span v-if="preview.body" class="mt-3 line-clamp-4 block whitespace-pre-line text-sm leading-6 text-toned">{{ preview.body }}</span>
    </div>

    <div v-else-if="preview.kind === 'list'" class="p-6">
      <span class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ preview.label }}</span>
      <span class="mt-3 block truncate text-lg font-semibold text-highlighted">{{ preview.title }}</span>
      <span v-if="preview.source" class="mt-1 block capitalize text-xs text-muted">{{ preview.source }}</span>
      <span v-if="preview.items.length" class="mt-4 grid grid-cols-2 gap-2">
        <span v-for="item in preview.items" :key="item" class="line-clamp-2 rounded-lg border border-default p-2 text-xs text-toned">{{ item }}</span>
      </span>
      <span v-else-if="!preview.source" class="mt-4 block text-sm text-muted">No items yet</span>
    </div>

    <div v-else class="px-5 py-8">
      <span class="mb-4 block text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{{ preview.label }}</span>
      <span class="block border-t border-accented" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { tenantPageBlockPreview } from '~/utils/tenant-page-editor'

const props = defineProps<{ block: TenantPageBlock }>()
const preview = computed(() => tenantPageBlockPreview(props.block))
</script>
