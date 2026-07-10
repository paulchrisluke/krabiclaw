<template>
  <header class="fixed inset-x-0 top-0 z-50 border-b border-gray-200 bg-white">
    <BlawbyBanner
      :content="site.banner_content"
      :phone="site.phone"
      :dismissible="site.banner_dismissible"
      :storage-key="`blawby-banner:${site.brand_name}:${site.banner_content}`"
    />
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <nav class="relative z-50 flex min-h-16 items-center justify-between gap-3 py-2" aria-label="Main navigation">
        <NuxtLink to="/" class="flex min-w-0 items-center no-underline" :aria-label="`${brandName} home`">
          <img
            v-if="site.logo_url"
            :src="site.logo_url"
            :alt="brandName"
            class="max-h-16 w-auto max-w-[160px] object-contain"
          >
          <span v-else class="blawby-display truncate text-lg text-[var(--blawby-primary)] sm:text-xl">
            {{ brandName }}
          </span>
        </NuxtLink>

        <div class="ml-auto flex shrink-0 items-center gap-1 font-semibold uppercase md:gap-8">
          <div class="hidden items-center text-[var(--blawby-primary)] md:flex">
            <NuxtLink
              v-for="item in headerItems"
              :key="item.id"
              :to="item.url"
              class="inline-block rounded-lg px-2 py-1 text-sm no-underline transition hover:text-[var(--blawby-accent-strong)]"
            >
              {{ item.label }}
            </NuxtLink>
          </div>

          <BlawbyButton
            :to="consultation.external_url || consultation.schedule_path"
            class="gap-2 px-3 sm:px-4"
            @click="trackConsultation"
          >
            <svg class="size-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" />
            </svg>
            <span class="hidden lg:inline">{{ consultation.cta_label }}</span>
            <span class="sr-only lg:hidden">{{ consultation.cta_label }}</span>
          </BlawbyButton>

          <button
            class="relative z-10 flex size-8 items-center justify-center text-[var(--blawby-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)] md:hidden"
            type="button"
            aria-label="Toggle navigation"
            :aria-expanded="mobileOpen"
            aria-controls="blawby-mobile-nav"
            @click="mobileOpen = !mobileOpen"
          >
            <svg class="size-4 overflow-visible stroke-current" viewBox="0 0 14 14" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path :class="mobileOpen ? 'scale-90 opacity-0' : ''" class="origin-center transition" d="M0 1H14M0 7H14M0 13H14" />
              <path :class="mobileOpen ? '' : 'scale-90 opacity-0'" class="origin-center transition" d="M2 2L12 12M12 2L2 12" />
            </svg>
          </button>

          <button
            v-if="mobileOpen"
            type="button"
            class="fixed inset-0 bg-slate-300/50 md:hidden"
            aria-label="Close navigation"
            @click="mobileOpen = false"
          />

          <div
            id="blawby-mobile-nav"
            class="absolute inset-x-0 top-full mt-4 origin-top rounded-2xl bg-white p-4 text-lg normal-case text-[var(--blawby-primary)] shadow-xl ring-1 ring-slate-900/5 transition md:hidden"
            :class="mobileOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'"
          >
            <NuxtLink
              v-for="item in mobileItems"
              :key="item.id"
              :to="item.url"
              class="block w-full p-2 no-underline"
              @click="mobileOpen = false"
            >
              {{ item.label }}
            </NuxtLink>
          </div>
        </div>
      </nav>
    </div>
  </header>
  <div class="mb-16" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { PublicBlawbyIdentity, PublicConsultationSettings, PublicNavigationItem } from '~/types/blawby'

const props = defineProps<{
  site: PublicBlawbyIdentity
  navigation: PublicNavigationItem[]
  consultation: PublicConsultationSettings
}>()

const { trackConsultationClick } = useBlawbyConversionTracking(() => props.consultation)
const route = useRoute()
const brandName = computed(() => props.site.brand_name || 'Blawby')
const mobileOpen = ref(false)
const headerItems = computed(() => {
  const configured = props.navigation.filter(item => item.area === 'header')
  if (configured.length) return configured
  return [
    { id: 'services', area: 'header', label: 'Services', url: '/services', item_type: 'internal', sort_order: 10, metadata: {} },
    { id: 'pricing', area: 'header', label: 'Pricing', url: '/pricing', item_type: 'internal', sort_order: 20, metadata: {} },
    { id: 'about', area: 'header', label: 'About', url: '/about', item_type: 'internal', sort_order: 30, metadata: {} },
    { id: 'contact', area: 'header', label: 'Contact', url: '/contact', item_type: 'internal', sort_order: 40, metadata: {} },
    { id: 'blog', area: 'header', label: 'Blog', url: '/blog', item_type: 'internal', sort_order: 50, metadata: {} },
    { id: 'donate', area: 'header', label: 'Donate', url: '/donate', item_type: 'internal', sort_order: 60, metadata: {} },
  ] as PublicNavigationItem[]
})
const mobileItems = computed(() => {
  const order = ['Services', 'Pricing', 'About', 'Donate', 'Contact', 'Blog']
  return [...headerItems.value].sort((left, right) => order.indexOf(left.label) - order.indexOf(right.label))
})

function trackConsultation() {
  trackConsultationClick('header', route.path, props.consultation.external_url || props.consultation.schedule_path)
}
</script>
