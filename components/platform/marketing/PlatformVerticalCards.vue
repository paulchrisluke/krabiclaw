<template>
  <div class="space-y-8" data-parity-section="verticals">
    <div class="text-center max-w-xl mx-auto">
      <span v-if="eyebrow" class="kc-eyebrow text-muted">{{ eyebrow }}</span>
      <h2 class="text-3xl font-bold text-default mt-2">{{ title }}</h2>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      <div v-for="(item, index) in items" :key="item.title" class="rounded-2xl border border-default bg-elevated/40 p-6 space-y-3">
        <div class="size-10 rounded-xl flex items-center justify-center" :class="tileClass(index)">
          <PlatformIcon :name="item.icon" class="size-5" :class="iconClass(index)" />
        </div>
        <h3 class="text-lg font-bold text-default m-0">{{ item.title }}</h3>
        <TenantPageMarkdown :content="item.description" class="text-sm text-muted leading-relaxed m-0" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'

/**
 * The About page's three verticals: small tinted icon tiles in the coral, teal,
 * navy order, each description carrying the customer's name in bold.
 */
defineProps<{
  eyebrow?: string | null
  title: string
  items: Array<{ title: string; description: string; icon: PlatformIconName }>
}>()

const TILES = ['bg-primary/10 text-primary', 'bg-(--kc-teal)/10 text-(--kc-teal-600)', 'bg-(--kc-navy)/10 text-default'] as const
function tileClass(index: number) {
  return TILES[index % TILES.length]
}
function iconClass(index: number) {
  return index % TILES.length === 2 ? 'text-primary' : ''
}
</script>
