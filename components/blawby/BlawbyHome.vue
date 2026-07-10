<template>
  <div data-parity-root>
    <section class="relative overflow-hidden bg-[var(--blawby-primary)] text-white">
      <div class="absolute inset-0 opacity-20" :style="heroImage ? `background-image:url('${heroImage}');background-size:cover;background-position:center;` : ''" />
      <div class="relative mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-28">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--blawby-accent)]">{{ compliance?.nonprofit_status || 'Professional services' }}</p>
          <h1 class="mt-5 max-w-4xl blawby-display text-5xl leading-tight sm:text-6xl lg:text-7xl">
            {{ site?.brand_name || 'Professional guidance with care.' }}
          </h1>
          <p class="mt-6 max-w-2xl text-lg leading-8 text-white/80">
            {{ site?.brand_description || compliance?.service_area || 'Clear information, thoughtful advocacy, and practical next steps for people who need help.' }}
          </p>
          <div class="mt-9 flex flex-wrap gap-3">
            <BlawbyButton :to="consultation.external_url || consultation.schedule_path" @click="trackConsultation">
              {{ consultation.cta_label }}
            </BlawbyButton>
            <BlawbyButton to="/services" variant="outline" class="border-white text-white hover:bg-white hover:text-[var(--blawby-primary)]">
              View services
            </BlawbyButton>
          </div>
        </div>
        <div class="self-end border border-white/20 bg-white/10 p-7 backdrop-blur">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--blawby-accent)]">Access to help</p>
          <div class="mt-6 grid gap-5">
            <NuxtLink
              v-for="offering in featuredOfferings"
              :key="offering.id"
              :to="`/services/${offering.slug}`"
              class="group block border-t border-white/15 pt-5 text-white no-underline"
            >
              <span class="blawby-display text-2xl">{{ offering.name }}</span>
              <p class="mt-2 text-sm leading-6 text-white/70">{{ offering.summary || offering.short_description }}</p>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div class="mb-12 max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Services</p>
        <h2 class="mt-4 blawby-display text-4xl text-[var(--blawby-primary)]">How we can help</h2>
      </div>
      <div v-if="offerings.length" class="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="offering in offerings.slice(0, 6)"
          :key="offering.id"
          :to="`/services/${offering.slug}`"
          class="group border border-[var(--blawby-border)] bg-white p-7 no-underline transition hover:-translate-y-0.5 hover:border-[var(--blawby-accent)]"
        >
          <img v-if="offering.thumbnail_url" :src="offering.thumbnail_url" :alt="offering.name" class="mb-5 aspect-[4/3] w-full object-cover">
          <h3 class="blawby-display text-2xl text-[var(--blawby-primary)]">{{ offering.name }}</h3>
          <p class="mt-3 text-sm leading-7 text-slate-600">{{ offering.summary || offering.short_description }}</p>
          <span class="mt-5 inline-block text-sm font-semibold text-[var(--blawby-accent-strong)]">Learn more</span>
        </NuxtLink>
      </div>
      <div v-else class="border border-[var(--blawby-border)] bg-white p-8 text-slate-600">
        Services will appear here once they are published.
      </div>
    </section>

    <section class="bg-white">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div class="lg:col-span-2">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Mission</p>
          <h2 class="mt-4 blawby-display text-4xl text-[var(--blawby-primary)]">{{ compliance?.entity_name || site?.brand_name || 'Our work' }}</h2>
          <p class="mt-5 text-base leading-8 text-slate-600">{{ compliance?.disclaimer || site?.brand_description }}</p>
        </div>
        <div class="border-l border-[var(--blawby-border)] pl-8">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Contact</p>
          <p class="mt-4 blawby-display text-2xl text-[var(--blawby-primary)]">{{ consultation.cta_label }}</p>
          <BlawbyButton class="mt-6" :to="consultation.external_url || consultation.schedule_path" @click="trackConsultation">
            Get started
          </BlawbyButton>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const { site } = useTenantSite()
const { offerings, compliance, consultation } = useBlawbySite()
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)

const featuredOfferings = computed(() => {
  const featured = offerings.value.filter((offering) => offering.featured)
  return (featured.length ? featured : offerings.value).slice(0, 3)
})
const heroImage = computed(() => featuredOfferings.value.find(offering => offering.hero_image_url)?.hero_image_url || featuredOfferings.value.find(offering => offering.thumbnail_url)?.thumbnail_url || '')

function trackConsultation() {
  trackConsultationClick('home', '/', consultation.value.external_url || consultation.value.schedule_path)
}

useSeoMeta({
  title: computed(() => site?.brand_name || 'Professional services'),
  description: computed(() => site?.brand_description || compliance.value?.service_area || 'Professional services and consultation.'),
  ogTitle: computed(() => site?.brand_name || 'Professional services'),
  ogDescription: computed(() => site?.brand_description || compliance.value?.service_area || 'Professional services and consultation.'),
  ogImage: computed(() => heroImage.value || undefined),
  ogType: 'website',
})
</script>
