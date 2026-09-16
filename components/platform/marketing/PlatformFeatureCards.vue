<template>
  <!--
    The homepage feature band: a gradient wash, hairlines top and bottom, and
    cards with navy gradient icon tiles that lift on hover.
  -->
  <section v-if="variant === 'home'" id="features" class="relative py-24 overflow-hidden" data-parity-section="features">
    <div class="absolute inset-0 -z-10" style="background: linear-gradient(180deg, var(--ui-bg-elevated) 0%, var(--ui-bg) 100%);"></div>
    <div class="absolute top-0 inset-x-0 h-px" style="background: linear-gradient(90deg, transparent 0%, var(--kc-border) 50%, transparent 100%);"></div>
    <div class="absolute bottom-0 inset-x-0 h-px" style="background: linear-gradient(90deg, transparent 0%, var(--kc-border) 50%, transparent 100%);"></div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-4">
        <span v-if="eyebrow" class="kc-eyebrow text-muted">{{ eyebrow }}</span>
        <h2 class="text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight leading-[1.05] m-0">
          <span class="text-default">{{ title }}</span>
          <template v-if="titleMuted"><br><span class="text-muted font-bold">{{ titleMuted }}</span></template>
        </h2>
      </div>
      <div class="grid md:grid-cols-3 gap-5">
        <div
          v-for="item in items"
          :key="item.title"
          class="group relative rounded-[18px] p-7 border border-default transition-all duration-300 hover:-translate-y-0.5 hover:border-(--kc-coral)/30 hover:shadow-lg bg-white dark:bg-(--ui-bg-elevated)"
        >
          <div
            class="absolute inset-x-0 top-0 h-px rounded-t-[18px] opacity-0 group-hover:opacity-100 transition-opacity"
            style="background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--kc-coral) 40%, transparent), transparent);"
          ></div>
          <div
            class="w-12 h-12 rounded-xl flex items-center justify-center mb-5 shadow-sm"
            style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%); box-shadow: 0 4px 12px rgba(31,37,71,0.15);"
          >
            <PlatformIcon :name="item.icon" class="size-5 text-white" />
          </div>
          <h3 class="text-lg font-bold mb-2 m-0 text-default">{{ item.title }}</h3>
          <p class="text-[14px] leading-relaxed m-0 text-muted">{{ item.description }}</p>
        </div>
      </div>
    </div>
  </section>

  <!-- The Features page: larger cards with a spec checklist and a documentation link each. -->
  <div v-else-if="variant === 'detailed'" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-24" data-parity-section="features">
    <div
      v-for="item in items"
      :key="item.title"
      class="group relative rounded-[22px] p-8 border border-default bg-elevated/40 backdrop-blur-md hover:bg-elevated/70 hover:border-primary/40 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 flex flex-col justify-between overflow-hidden"
    >
      <div class="absolute top-0 right-0 w-24 h-24 bg-linear-to-bl from-primary/5 to-transparent rounded-bl-full group-hover:from-primary/10 transition-all duration-300"></div>
      <div>
        <div
          class="w-12 h-12 rounded-xl flex items-center justify-center mb-6 shadow-sm"
          style="background: linear-gradient(135deg, var(--kc-navy) 0%, var(--kc-navy-700) 100%); box-shadow: 0 4px 12px rgba(31,37,71,0.15);"
        >
          <PlatformIcon :name="item.icon" class="size-6 text-white" />
        </div>
        <h3 class="text-xl font-extrabold text-default mb-3 group-hover:text-primary transition-colors">{{ item.title }}</h3>
        <p class="text-[14px] leading-relaxed text-muted mb-6">{{ item.description }}</p>
        <ul v-if="item.specs?.length" class="space-y-2.5 p-0 mb-8 list-none">
          <li v-for="spec in item.specs" :key="spec" class="flex items-start gap-2 text-[13px] text-muted leading-snug">
            <PlatformIcon name="check-circle" class="size-4 shrink-0 text-(--kc-teal) mt-0.5" />
            <span>{{ spec }}</span>
          </li>
        </ul>
      </div>
      <div v-if="item.url && item.linkLabel" class="pt-4 border-t border-default/50">
        <NuxtLink
          :to="item.url"
          class="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:text-primary/80 transition-colors no-underline group/link"
        >
          {{ item.linkLabel }}
          <PlatformIcon name="arrow-right" class="size-3.5 transition-transform group-hover/link:translate-x-1" />
        </NuxtLink>
      </div>
    </div>
  </div>

  <!-- The vertical pages: solid navy icon tiles on elevated cards. -->
  <div v-else class="max-w-6xl mx-auto mb-24" data-parity-section="features">
    <div class="text-center max-w-2xl mx-auto mb-14">
      <span v-if="eyebrow" class="kc-eyebrow text-muted">{{ eyebrow }}</span>
      <h2 class="text-3xl sm:text-4xl font-extrabold text-default mt-2">{{ title }}</h2>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      <div
        v-for="item in items"
        :key="item.title"
        class="rounded-2xl border border-default bg-elevated/40 p-7 hover:border-primary/40 transition-all duration-200 flex flex-col justify-between"
      >
        <div>
          <div class="size-11 rounded-xl bg-(--kc-navy) text-white flex items-center justify-center mb-5 shadow-sm">
            <PlatformIcon :name="item.icon" class="size-5" />
          </div>
          <h3 class="text-lg font-bold text-default mb-2">{{ item.title }}</h3>
          <p class="text-sm text-muted leading-relaxed m-0">{{ item.description }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { blockText, blockTextOrNull, blockRecords, blockStrings } from '~/utils/tenant-page-block-data'
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'

export interface PlatformFeatureCard {
  title: string
  description: string
  icon: PlatformIconName
  specs?: string[]
  url?: string | null
  /** The link's words. A card that carries a route carries what to call it. */
  linkLabel?: string | null
}

/**
 * A grid of features, in the three shapes KrabiClaw's pages draw it: the
 * homepage band, the Features page's detailed cards, and the vertical pages'
 * plain grid.
 */
const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()

const eyebrow = computed(() => blockTextOrNull(props.block.data.eyebrow))
const title = computed(() => blockTextOrNull(props.block.data.title))
const titleMuted = computed(() => blockTextOrNull(props.block.data.title_muted))
const items = computed<PlatformFeatureCard[]>(() => blockRecords(props.block.data.items).map(item => ({
  title: blockText(item.title),
  description: blockText(item.description),
  icon: (blockTextOrNull(item.icon) ?? 'sparkles') as PlatformIconName,
  specs: blockStrings(item.specs),
  url: blockTextOrNull(item.url),
  linkLabel: blockTextOrNull(item.label),
})).filter(item => item.title))

/**
 * A card list with specifications reads as a detail page; one on a vertical
 * landing page reads as that vertical's. Both are this component's own reading
 * of its content and its page, which is what a template is for.
 */
const variant = computed<'home' | 'detailed' | 'vertical'>(() => {
  if (items.value.some(item => (item.specs ?? []).length)) return 'detailed'
  return ['/restaurants', '/experiences', '/legal'].includes(props.page.path) ? 'vertical' : 'home'
})
</script>
