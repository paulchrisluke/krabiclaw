<template>
  <div class="grid md:grid-cols-2 gap-8 mb-24 max-w-5xl mx-auto" data-parity-section="comparison">
    <!-- The way it is done without KrabiClaw. -->
    <div class="rounded-3xl border border-default/60 bg-elevated/30 p-8 flex flex-col justify-between">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-500/10 text-red-500 mb-6 border border-red-500/20">
          <PlatformIcon :name="against.pillIcon || 'x'" class="size-3.5" />
          {{ against.pill }}
        </div>
        <h3 class="text-2xl font-bold text-default mb-4">{{ against.title }}</h3>
        <ul class="space-y-4 p-0 list-none text-sm text-muted">
          <li v-for="item in against.items" :key="item.title" class="flex items-start gap-3">
            <span class="size-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">✕</span>
            <span><strong>{{ item.title }}:</strong> {{ item.description }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- The KrabiClaw way, in the vertical's accent. -->
    <div class="rounded-3xl bg-elevated/80 p-8 flex flex-col justify-between relative shadow-xl" :class="accentClasses.card">
      <div class="absolute top-0 right-0 w-32 h-32 rounded-bl-full pointer-events-none" :class="accentClasses.wash"></div>
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-6" :class="accentClasses.pill">
          <PlatformIcon :name="forCard.pillIcon || 'check'" class="size-3.5" />
          {{ forCard.pill }}
        </div>
        <h3 class="text-2xl font-bold text-default mb-4">{{ forCard.title }}</h3>
        <ul class="space-y-4 p-0 list-none text-sm text-default/90">
          <li v-for="item in forCard.items" :key="item.title" class="flex items-start gap-3">
            <PlatformIcon name="check-circle" class="size-5 text-(--kc-teal) shrink-0 mt-0.5" />
            <span><strong>{{ item.title }}:</strong> {{ item.description }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'

export interface PlatformComparisonColumn {
  pill: string
  pillIcon?: PlatformIconName | null
  title: string
  items: Array<{ title: string; description: string }>
}

/**
 * The two-column "without / with" section every vertical page opens with. The
 * left column is always the red-marked list; the right column wears the
 * vertical's accent — coral for restaurants, teal for experiences, navy for
 * legal.
 */
const props = defineProps<{
  accent: 'primary' | 'teal' | 'navy'
  against: PlatformComparisonColumn
  forCard: PlatformComparisonColumn
}>()

const ACCENTS = {
  primary: {
    card: 'border border-primary/30 shadow-primary/5',
    wash: 'bg-primary/10',
    pill: 'bg-primary/15 text-primary border border-primary/25',
  },
  teal: {
    card: 'border border-(--kc-teal)/40 shadow-(--kc-teal)/5',
    wash: 'bg-(--kc-teal)/10',
    pill: 'bg-(--kc-teal)/15 text-(--kc-teal-600) border border-(--kc-teal)/25',
  },
  navy: {
    card: 'border border-(--kc-navy)/30 shadow-(--kc-navy)/5',
    wash: 'bg-(--kc-navy)/10',
    pill: 'bg-(--kc-navy)/10 text-default border border-(--kc-navy)/25',
  },
} as const

const accentClasses = computed(() => ACCENTS[props.accent])
</script>
