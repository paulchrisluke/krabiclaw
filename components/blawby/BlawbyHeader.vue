<template>
  <header data-blawby-critical-header class="fixed inset-x-0 top-0 z-50 border-b border-gray-200 bg-white">
    <BlawbyBanner
      data-blawby-critical-banner
      :content="site.banner_content"
      :phone="site.phone"
      :dismissible="site.banner_dismissible"
      :storage-key="`blawby-banner:${site.brand_name}:${site.banner_content}`"
    />
    <div class="blawby-container">
      <nav class="relative z-50 flex justify-between py-2" aria-label="Main navigation">
        <div class="flex items-center md:gap-x-12">
          <NuxtLink to="/" class="no-underline" :aria-label="`${brandName} home`">
            <img
              v-if="logoUrl"
              :src="logoUrl"
              :alt="brandName"
              loading="eager"
              decoding="async"
              class="max-h-16 w-min max-w-[160px] object-contain"
            >
            <span v-else class="blawby-display truncate text-lg text-[var(--blawby-primary)] sm:text-xl">
              {{ brandName }}
            </span>
          </NuxtLink>
        </div>

        <div class="flex items-center gap-x-1 font-semibold uppercase md:gap-x-8">
          <div class="hidden text-[var(--blawby-primary)] md:block">
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
            :to="consultation.schedule_path"
            @click="trackConsultation"
          >
            <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" />
            </svg>
            <span>{{ headerCtaLabel }}</span>
          </BlawbyButton>

          <details ref="mobileNavDetails" class="relative -mr-1 md:hidden" @toggle="syncMobileNavState">
            <summary
              class="relative z-10 flex size-8 list-none items-center justify-center text-[var(--blawby-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)] [&::-webkit-details-marker]:hidden"
              aria-label="Toggle navigation"
            >
              <svg class="size-4 overflow-visible stroke-current" viewBox="0 0 14 14" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path :class="mobileOpen ? 'scale-90 opacity-0' : ''" class="origin-center transition" d="M0 1H14M0 7H14M0 13H14" />
                <path :class="mobileOpen ? '' : 'scale-90 opacity-0'" class="origin-center transition" d="M2 2L12 12M12 2L2 12" />
              </svg>
            </summary>

            <div
              id="blawby-mobile-nav"
              class="absolute right-0 top-full mt-4 w-[min(20rem,calc(100vw-2rem))] origin-top rounded-2xl bg-white p-4 text-lg normal-case text-[var(--blawby-primary)] shadow-xl ring-1 ring-slate-900/5"
            >
              <NuxtLink
                v-for="item in mobileItems"
                :key="item.id"
                :to="item.url"
                class="block w-full p-2 no-underline"
                @click="closeMobileNav"
              >
                {{ item.label }}
              </NuxtLink>
            </div>
          </details>
        </div>
      </nav>
    </div>
  </header>
  <div class="blawby-critical-header-spacer mb-16" aria-hidden="true" />
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
const brandName = computed(() => props.site.brand_name || '')
const logoUrl = computed(() => props.site.logo_url || null)
const headerCtaLabel = computed(() => typeof props.consultation.metadata.header_cta_label === 'string'
  ? props.consultation.metadata.header_cta_label
  : 'Get Started')
const mobileOpen = ref(false)
const mobileNavDetails = ref<HTMLDetailsElement | null>(null)
const headerItems = computed(() => {
  return props.navigation.filter(item => item.area === 'header')
})
const mobileItems = headerItems

function syncMobileNavState(event: Event) {
  mobileOpen.value = (event.currentTarget as HTMLDetailsElement).open
}

function closeMobileNav() {
  mobileOpen.value = false
  if (mobileNavDetails.value) mobileNavDetails.value.open = false
}

onMounted(() => {
  mobileOpen.value = mobileNavDetails.value?.open ?? false
})

function trackConsultation() {
  trackConsultationClick('header', route.path, props.consultation.schedule_path)
}
</script>
