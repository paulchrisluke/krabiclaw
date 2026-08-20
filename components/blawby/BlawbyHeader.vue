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

        <div class="flex items-center font-semibold uppercase">
          <BlawbyButton
            :to="consultation.schedule_path"
            @click="trackConsultation"
          >
            <svg class="-ml-0.5 mr-2 size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M7.5 4.5h9A4.5 4.5 0 0 1 21 9v3a4.5 4.5 0 0 1-4.5 4.5h-4.86L7.2 20.2a.75.75 0 0 1-1.2-.6v-3.35A4.5 4.5 0 0 1 3 12V9a4.5 4.5 0 0 1 4.5-4.5Z" />
            </svg>
            <span>{{ headerCtaLabel }}</span>
          </BlawbyButton>

        </div>
      </nav>
    </div>
  </header>
  <div class="blawby-critical-header-spacer mb-16" aria-hidden="true" />
</template>

<script setup lang="ts">
import type { PublicBlawbyIdentity, PublicConsultationSettings } from '~/types/blawby'

const props = defineProps<{
  site: PublicBlawbyIdentity
  consultation: PublicConsultationSettings
}>()

const { trackConsultationClick } = useBlawbyConversionTracking(() => props.consultation)
const route = useRoute()
const brandName = computed(() => props.site.brand_name || '')
const logoUrl = computed(() => props.site.logo_url || null)
const headerCtaLabel = computed(() => typeof props.consultation.metadata.header_cta_label === 'string'
  ? props.consultation.metadata.header_cta_label
  : 'Get Started')
function trackConsultation() {
  trackConsultationClick('header', route.path, props.consultation.schedule_path)
}
</script>
