<template>
  <div class="rounded-3xl border border-default bg-elevated/40 p-8 sm:p-12 mb-24 max-w-5xl mx-auto backdrop-blur-md" data-parity-section="workflows">
    <div class="text-center max-w-2xl mx-auto mb-10">
      <span v-if="eyebrow" class="kc-eyebrow" :class="eyebrowClass">{{ eyebrow }}</span>
      <h2 class="text-3xl font-extrabold text-default mt-2">{{ title }}</h2>
      <p v-if="description" class="text-sm text-muted mt-2">{{ description }}</p>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      <div
        v-for="(item, index) in items"
        :key="item.title"
        class="rounded-2xl border border-default bg-default p-6 flex flex-col justify-between shadow-sm"
      >
        <div>
          <div class="flex items-center gap-2 mb-4 text-xs font-bold uppercase" :class="labelClass(index)">
            <PlatformIcon :name="item.icon" class="size-4" />
            {{ item.title }}
          </div>
          <div class="rounded-xl bg-muted/40 p-3 text-xs font-mono text-muted mb-4 border border-default/50">
            “{{ item.prompt }}”
          </div>
          <p class="text-[13px] text-muted leading-relaxed m-0">{{ item.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'

export interface PlatformWorkflow {
  title: string
  icon: PlatformIconName
  prompt: string
  description: string
}

/**
 * Three conversational workflows: a labelled card, the prompt someone would
 * type, and what happens. Each card's label colour follows the vertical's own
 * sequence, which is why the accent order is a prop rather than a constant.
 */
const props = defineProps<{
  accent: 'primary' | 'teal' | 'navy'
  eyebrow?: string | null
  title: string
  description?: string | null
  items: PlatformWorkflow[]
}>()

const EYEBROW: Record<typeof props.accent, string> = {
  primary: 'text-primary',
  teal: 'text-(--kc-teal-600)',
  navy: 'text-primary',
}
const LABELS: Record<typeof props.accent, readonly string[]> = {
  primary: ['text-(--kc-coral)', 'text-(--kc-teal)', 'text-primary'],
  teal: ['text-(--kc-teal)', 'text-primary', 'text-(--kc-coral)'],
  navy: ['text-primary', 'text-(--kc-teal)', 'text-(--kc-coral)'],
}
const eyebrowClass = computed(() => EYEBROW[props.accent])
function labelClass(index: number) {
  const sequence = LABELS[props.accent]
  return sequence[index % sequence.length]
}
</script>
