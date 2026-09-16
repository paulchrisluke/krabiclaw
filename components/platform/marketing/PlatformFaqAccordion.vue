<template>
  <div v-if="items.length" class="max-w-3xl mx-auto mt-28" data-parity-section="faq">
    <div class="text-center mb-12 flex flex-col items-center gap-2">
      <span v-if="eyebrow" class="text-xs font-bold tracking-widest uppercase text-primary">{{ eyebrow }}</span>
      <h2 class="text-3xl font-extrabold tracking-tight text-default mt-1">{{ title }}</h2>
    </div>
    <div class="space-y-4">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="group rounded-2xl border transition-all duration-300 bg-elevated/40 backdrop-blur-sm"
        :class="open === index ? 'border-primary/45 bg-elevated/70 shadow-lg shadow-primary/5' : 'border-default hover:border-primary/25 hover:bg-elevated/60'"
      >
        <button
          type="button"
          class="w-full text-left px-6 py-5 flex items-center justify-between gap-4 cursor-pointer"
          :aria-expanded="open === index"
          @click="open = open === index ? null : index"
        >
          <span class="font-bold text-[15px] transition-colors duration-200" :class="open === index ? 'text-primary' : 'text-default group-hover:text-primary/90'">
            {{ item.question }}
          </span>
          <div class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300" :class="open === index ? 'bg-primary/10 text-primary rotate-180' : 'bg-default text-muted group-hover:bg-primary/5 group-hover:text-primary'">
            <PlatformIcon name="chevron-down" class="shrink-0 w-5 h-5" />
          </div>
        </button>
        <div v-if="open === index" class="px-6 pb-6 pt-1 text-[14px] leading-relaxed text-muted border-t border-default/30 animate-[fadeIn_0.2s_ease-out]">
          {{ item.answer }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull, blockRecords } from '~/utils/tenant-page-block-data'
/** The Pricing page's accordion: one question open at a time, the chevron turning. */
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

// The questions are the page's own Q&A records, resolved onto the block by the
// public page loader.
const eyebrow = computed(() => blockTextOrNull(props.block.data.label))
const title = computed(() => blockText(props.block.data.title))
const items = computed(() => blockRecords(props.block.data.items)
  .map(item => ({ question: blockText(item.title) || blockText(item.question), answer: blockText(item.description) || blockText(item.answer) }))
  .filter(item => item.question && item.answer))

// Which row is open, by position. Keyed by the question text, two pages with
// the same question opened together and closed each other.
const open = ref<number | null>(null)
</script>
