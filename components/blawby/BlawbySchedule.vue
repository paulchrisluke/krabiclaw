<template>
  <section data-parity-root class="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Consultation</p>
      <h1 class="mt-4 blawby-display text-5xl leading-tight text-[var(--blawby-primary)]">Request a consultation</h1>
      <p class="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        Choose the best next step. This site can either link to an external booking flow or use KrabiClaw confirmation pages after a native booking flow is enabled.
      </p>
      <BlawbyButton class="mt-8" :to="consultation.external_url || consultation.confirmation_path" @click="trackConsultation">
        {{ consultation.cta_label }}
      </BlawbyButton>
    </div>
    <aside class="border border-[var(--blawby-border)] bg-white p-7">
      <h2 class="blawby-display text-3xl text-[var(--blawby-primary)]">What to expect</h2>
      <ul class="mt-5 space-y-3 text-sm leading-7 text-slate-600">
        <li>Share a short description of the issue.</li>
        <li>Include any deadlines or notices.</li>
        <li>A team member can follow up with next steps.</li>
      </ul>
    </aside>
  </section>
</template>

<script setup lang="ts">
const { site } = useTenantSite()
const { consultation } = useBlawbySite()
const { trackConsultationClick } = useBlawbyConversionTracking(consultation)

function trackConsultation() {
  trackConsultationClick('schedule', '/schedule', consultation.value.external_url || consultation.value.confirmation_path)
}

useSeoMeta({
  title: computed(() => `Consultation | ${site?.brand_name || 'Professional services'}`),
  description: 'Request a consultation and get practical next steps.',
})
</script>
