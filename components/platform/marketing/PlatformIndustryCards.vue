<template>
  <section id="solutions" class="py-20 border-t border-default bg-elevated/20" data-parity-section="industries">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center max-w-2xl mx-auto mb-14 flex flex-col items-center gap-3">
        <span v-if="eyebrow" class="kc-eyebrow text-primary">{{ eyebrow }}</span>
        <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-default m-0">{{ title }}</h2>
        <p v-if="description" class="text-base text-muted m-0">{{ description }}</p>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        <NuxtLink
          v-for="(item, index) in items"
          :key="item.url"
          :to="item.url"
          class="group rounded-3xl p-8 border border-default bg-elevated/40 hover:bg-elevated/70 transition-all duration-300 no-underline flex flex-col justify-between shadow-sm hover:shadow-md"
          :class="accent(index).card"
        >
          <div>
            <div class="size-12 rounded-2xl flex items-center justify-center mb-6" :class="accent(index).tile">
              <PlatformIcon :name="item.icon" class="size-6" :class="accent(index).icon" />
            </div>
            <h3 class="text-xl font-bold text-default mb-2 transition-colors" :class="accent(index).heading">{{ item.title }}</h3>
            <p class="text-sm text-muted leading-relaxed mb-6">{{ item.description }}</p>
          </div>
          <div class="inline-flex items-center gap-1 text-sm font-semibold" :class="accent(index).link">
            {{ item.linkLabel }} →
          </div>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PlatformIconName } from '~/components/platform/PlatformIcon.vue'

export interface PlatformIndustryCard {
  title: string
  description: string
  url: string
  icon: PlatformIconName
  linkLabel: string
}

/**
 * The homepage's three industry cards. Each vertical wears its own accent —
 * coral, teal, navy — in the order the homepage has always shown them, so the
 * accent belongs to the position, not the record.
 */
defineProps<{
  eyebrow?: string | null
  title: string
  description?: string | null
  items: PlatformIndustryCard[]
}>()

const ACCENTS = [
  {
    card: 'hover:border-primary/40',
    tile: 'bg-primary/10 text-primary border border-primary/20',
    icon: '',
    heading: 'group-hover:text-primary',
    link: 'text-primary',
  },
  {
    card: 'hover:border-(--kc-teal)/50',
    tile: 'bg-(--kc-teal)/10 text-(--kc-teal-600) border border-(--kc-teal)/20',
    icon: '',
    heading: 'group-hover:text-(--kc-teal-600)',
    link: 'text-(--kc-teal-600)',
  },
  {
    card: 'hover:border-(--kc-navy-700)/50',
    tile: 'bg-(--kc-navy)/10 text-default border border-default',
    icon: 'text-primary',
    heading: 'group-hover:text-primary',
    link: 'text-primary',
  },
] as const

function accent(index: number) {
  return ACCENTS[index % ACCENTS.length]!
}
</script>
