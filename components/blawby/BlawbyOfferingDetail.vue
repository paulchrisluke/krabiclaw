<template>
  <article v-if="offering" data-parity-root class="bg-[var(--blawby-bg)]">
    <header class="bg-[var(--blawby-primary)] text-white">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent)]">Practice area</p>
          <h1 class="mt-4 blawby-display text-5xl leading-tight lg:text-6xl">{{ offering.name }}</h1>
          <p class="mt-6 max-w-2xl text-lg leading-8 text-white/75">{{ offering.summary || offering.short_description }}</p>
          <BlawbyButton class="mt-8" :to="offering.cta_url || consultation.external_url || consultation.schedule_path" @click="trackConsultation">
            {{ offering.cta_label || consultation.cta_label }}
          </BlawbyButton>
        </div>
        <img v-if="offering.hero_image_url || offering.thumbnail_url" :src="offering.hero_image_url || offering.thumbnail_url || undefined" :alt="offering.name" class="aspect-[4/3] w-full object-cover">
      </div>
    </header>

    <div class="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
      <div>
        <BlawbyRichText :content="offering.body || offering.short_description || offering.summary" />

        <section v-if="offering.features.length" class="mt-14">
          <h2 class="blawby-display text-3xl text-[var(--blawby-primary)]">How we help</h2>
          <div class="mt-6 grid gap-4 md:grid-cols-2">
            <div v-for="feature in offering.features" :key="feature" class="border border-[var(--blawby-border)] bg-white p-5 text-sm leading-7 text-slate-600">
              {{ feature }}
            </div>
          </div>
        </section>

        <section v-if="offering.faqs.length" class="mt-14">
          <h2 class="blawby-display text-3xl text-[var(--blawby-primary)]">Questions</h2>
          <div class="mt-6 divide-y divide-[var(--blawby-border)] border border-[var(--blawby-border)] bg-white">
            <details v-for="faq in offering.faqs" :key="faq.question" class="p-5">
              <summary class="cursor-pointer font-semibold text-[var(--blawby-primary)]">{{ faq.question }}</summary>
              <p class="mt-3 text-sm leading-7 text-slate-600">{{ faq.answer }}</p>
            </details>
          </div>
        </section>
      </div>

      <aside class="h-fit border border-[var(--blawby-border)] bg-white p-7">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Next step</p>
        <h2 class="mt-4 blawby-display text-3xl text-[var(--blawby-primary)]">Request a consultation</h2>
        <p class="mt-4 text-sm leading-7 text-slate-600">A consultation can help clarify the issues, deadlines, and practical options involved.</p>
        <BlawbyButton class="mt-6 w-full" :to="offering.cta_url || consultation.external_url || consultation.schedule_path" @click="trackConsultation">
          {{ offering.cta_label || consultation.cta_label }}
        </BlawbyButton>
      </aside>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { PublicOffering } from '~/types/blawby'

const props = defineProps<{
  offering: PublicOffering
}>()

const { site } = useTenantSite()
const { consultation } = useBlawbySite()
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)

function trackConsultation() {
  trackConsultationClick(
    'offering',
    `/services/${props.offering.slug}`,
    props.offering.cta_url || consultation.value.external_url || consultation.value.schedule_path,
  )
}

useSeoMeta({
  title: computed(() => props.offering.seo_title || `${props.offering.name || 'Service'} | ${site?.brand_name || 'Professional services'}`),
  description: computed(() => props.offering.seo_description || props.offering.summary || 'Professional service details.'),
  ogImage: computed(() => props.offering.hero_image_url || props.offering.thumbnail_url || undefined),
})
</script>
