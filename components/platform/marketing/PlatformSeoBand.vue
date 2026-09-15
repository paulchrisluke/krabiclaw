<template>
  <div class="relative rounded-[28px] overflow-hidden border border-default p-8 sm:p-12 mb-20 bg-(--kc-navy) text-white shadow-xl" data-parity-section="seo-band">
    <div class="absolute -top-32 -right-32 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-80"></div>
    <div class="absolute -bottom-32 -left-32 w-80 h-80 bg-(--kc-teal)/20 rounded-full blur-3xl opacity-60"></div>

    <div class="relative z-10 grid lg:grid-cols-12 gap-8 items-center">
      <div class="lg:col-span-7 space-y-6">
        <span v-if="pill" class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white/90 border border-white/20">
          <PlatformIcon v-if="pillIcon" :name="pillIcon" class="size-3.5" />
          {{ pill }}
        </span>
        <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white m-0">{{ title }}</h2>
        <TenantPageMarkdown v-if="description" :content="description" class="text-white/80 text-[15px] sm:text-base leading-relaxed max-w-2xl m-0" />
        <div v-if="ctaLabel || secondaryLabel" class="flex flex-wrap gap-4 pt-2">
          <PlatformButton v-if="ctaLabel && ctaUrl" :to="ctaUrl" size="lg">
            {{ ctaLabel }}
            <PlatformIcon name="book" class="size-4" />
          </PlatformButton>
          <NuxtLink
            v-if="secondaryLabel && secondaryUrl"
            :to="secondaryUrl"
            class="inline-flex items-center gap-1 text-[14px] font-semibold text-white/90 hover:text-white hover:underline transition-colors no-underline"
          >
            {{ secondaryLabel }} →
          </NuxtLink>
        </div>
      </div>
      <div class="lg:col-span-5 flex justify-center">
        <div class="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl max-w-sm w-full space-y-4">
          <div class="flex items-center justify-between border-b border-white/10 pb-4">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-(--kc-coral) flex items-center justify-center">
                <PlatformIcon name="bar-chart" class="size-4 text-white" />
              </div>
              <span class="font-semibold text-sm">{{ cardTitle }}</span>
            </div>
            <span v-if="cardBadge" class="text-xs bg-(--kc-teal)/20 text-(--kc-teal) px-2.5 py-0.5 rounded-full font-medium">{{ cardBadge }}</span>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div v-for="row in rows.slice(0, 2)" :key="row.label" class="bg-white/5 p-4 rounded-xl border border-white/5">
              <div class="text-xs text-white/60 mb-1">{{ row.label }}</div>
              <div class="text-xl font-bold">{{ row.value }}</div>
            </div>
          </div>
          <div v-if="rows[2]" class="bg-white/5 p-4 rounded-xl border border-white/5 space-y-2">
            <div class="flex justify-between text-xs">
              <span class="text-white/60">{{ rows[2].label }}</span>
              <span class="text-(--kc-teal) font-semibold">{{ rows[2].value }}</span>
            </div>
            <div class="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div class="h-full bg-linear-to-r from-primary to-(--kc-teal) w-4/5 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'

/**
 * The Features page's navy analytics band with the mock dashboard card. The
 * card's rows are content: two stat tiles and a labelled bar. What they say
 * comes from the document, so the band cannot carry a number nobody measured.
 */
withDefaults(defineProps<{
  pill?: string | null
  pillIcon?: PlatformIconName | null
  title: string
  description?: string | null
  ctaLabel?: string | null
  ctaUrl?: string | null
  secondaryLabel?: string | null
  secondaryUrl?: string | null
  cardTitle?: string
  cardBadge?: string | null
  rows: Array<{ label: string; value: string }>
}>(), {
  pill: null,
  pillIcon: null,
  description: null,
  ctaLabel: null,
  ctaUrl: null,
  secondaryLabel: null,
  secondaryUrl: null,
  cardTitle: 'Direct Storefront Stats',
  cardBadge: null,
})
</script>
