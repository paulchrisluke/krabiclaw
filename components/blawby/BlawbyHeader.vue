<template>
  <header class="sticky top-0 z-40 border-b border-[var(--blawby-border)] bg-white/95 backdrop-blur">
    <div class="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
      <NuxtLink to="/" class="flex items-center gap-3 no-underline">
        <img v-if="site?.logo_url" :src="site.logo_url" :alt="brandName" class="size-10 object-contain">
        <span v-else class="flex size-10 items-center justify-center border border-[var(--blawby-border)] font-display text-lg text-[var(--blawby-primary)]">B</span>
        <span class="font-display text-xl text-[var(--blawby-primary)]">{{ brandName }}</span>
      </NuxtLink>

      <nav class="hidden items-center gap-7 text-sm font-semibold text-[var(--blawby-primary)] lg:flex" aria-label="Main navigation">
        <NuxtLink
          v-for="item in headerItems"
          :key="item.id"
          :to="item.url"
          class="no-underline transition hover:text-[var(--blawby-accent-strong)]"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <BlawbyButton :to="consultation.external_url || consultation.schedule_path" @click="trackConsultation">
        {{ consultation.cta_label }}
      </BlawbyButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { PublicConsultationSettings, PublicNavigationItem } from '~/types/blawby'

const props = defineProps<{
  site: { brand_name?: string | null; logo_url?: string | null } | null
  navigation: PublicNavigationItem[]
  consultation: PublicConsultationSettings
}>()

const { trackConsultationClick } = useBlawbyConversionTracking()
const brandName = computed(() => props.site?.brand_name || 'Blawby')
const headerItems = computed(() => {
  const configured = props.navigation.filter(item => item.area === 'header')
  if (configured.length) return configured
  return [
    { id: 'services', area: 'header', label: 'Services', url: '/services', item_type: 'internal', sort_order: 10, metadata: {} },
    { id: 'pricing', area: 'header', label: 'Pricing', url: '/pricing', item_type: 'internal', sort_order: 20, metadata: {} },
    { id: 'blog', area: 'header', label: 'Articles', url: '/blog', item_type: 'internal', sort_order: 30, metadata: {} },
    { id: 'about', area: 'header', label: 'About', url: '/about', item_type: 'internal', sort_order: 40, metadata: {} },
    { id: 'contact', area: 'header', label: 'Contact', url: '/contact', item_type: 'internal', sort_order: 50, metadata: {} },
  ] as PublicNavigationItem[]
})

function trackConsultation() {
  trackConsultationClick('header', useRoute().path, props.consultation.external_url || props.consultation.schedule_path)
}
</script>
