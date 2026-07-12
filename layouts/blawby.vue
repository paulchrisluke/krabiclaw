<template>
  <div class="blawby-shell min-h-screen bg-[var(--blawby-bg)] text-[var(--blawby-ink)]" :style="themeStyles" :data-hydrated="hydrated ? 'true' : 'false'">
    <BlawbyHeader :site="identity" :navigation="navigation" :consultation="consultation" />
    <main>
      <slot />
    </main>
    <BlawbyFooter
      :site="identity"
      :navigation="navigation"
      :compliance="compliance"
      :offering-links="offeringLinks"
    />
    <ConsentBanner privacy-path="/policies/privacy" />
  </div>
</template>

<script setup lang="ts">
import { serializeJsonLd } from '~/utils/json-ld'
import ConsentBanner from '~/components/ConsentBanner.vue'

const { identity, navigation, consultation, compliance, themeTokens, offeringLinks } = await useBlawbyShell()
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })
const requestUrl = useRequestURL()

const themeStyles = computed(() => {
  const tokens = themeTokens.value
  return {
    '--blawby-bg': String(tokens.bg || '#fbfaf7'),
    '--blawby-surface': String(tokens.surface || '#ffffff'),
    '--blawby-primary': String(tokens.primary || '#25356c'),
    '--blawby-primary-dark': String(tokens.primaryDark || '#161f3b'),
    '--blawby-primary-100': String(tokens.primary100 || '#f2f5ff'),
    '--blawby-primary-200': String(tokens.primary200 || '#b4c5e5'),
    '--blawby-primary-800': String(tokens.primary800 || '#1d294f'),
    '--blawby-accent': String(tokens.accent || '#c19855'),
    '--blawby-accent-100': String(tokens.accent100 || '#faf5ea'),
    '--blawby-accent-200': String(tokens.accent200 || '#f8f0e1'),
    '--blawby-accent-button': String(tokens.accentButton || '#b58c4f'),
    '--blawby-accent-strong': String(tokens.accentStrong || '#a37732'),
    '--blawby-border': String(tokens.border || '#e5e7eb'),
    '--blawby-ink': String(tokens.ink || '#162033'),
  }
})

useHead(() => ({
  htmlAttrs: { class: 'blawby-document' },
  script: [{
    type: 'application/ld+json',
    children: serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': ['ProfessionalService', 'Organization'],
      name: identity.value.brand_name || compliance.value?.entity_name || 'Professional services',
      description: identity.value.brand_description || undefined,
      url: requestUrl.origin,
      logo: identity.value.logo_url || undefined,
      areaServed: compliance.value?.service_area || undefined,
      nonprofitStatus: compliance.value?.nonprofit_status || undefined,
    }),
  }],
}))
</script>

<style>
html.blawby-document {
  font-size: 100%;
}

.blawby-shell {
  font-family: Poppins, ui-sans-serif, system-ui, sans-serif;
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.5rem;
  --text-base: 1rem;
  --text-base--line-height: 1.75rem;
  --text-lg: 1.125rem;
  --text-lg--line-height: 2rem;
  --text-xl: 1.25rem;
  --text-xl--line-height: 2rem;
  --text-2xl: 1.5rem;
  --text-2xl--line-height: 2rem;
  --text-3xl: 2rem;
  --text-3xl--line-height: 2.5rem;
  --text-4xl: 2.5rem;
  --text-4xl--line-height: 3.5rem;
  --text-5xl: 3rem;
  --text-5xl--line-height: 3.5rem;
  --text-6xl: 3.75rem;
  --text-6xl--line-height: 1;
  --text-7xl: 4.5rem;
  --text-7xl--line-height: 1.1;
  --text-8xl: 6rem;
  --text-8xl--line-height: 1;
  --text-9xl: 8rem;
  --text-9xl--line-height: 1;
  --container-2xl: 40rem;
}

.blawby-container {
  margin-inline: auto;
  max-width: 80rem;
  padding-inline: 1rem;
  width: 100%;
}

@media (min-width: 640px) {
  .blawby-container {
    padding-inline: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .blawby-container {
    padding-inline: 2rem;
  }
}

@media (min-width: 1920px) {
  .blawby-container {
    max-width: 88rem;
    padding-inline: 3rem;
  }
}

@media (min-width: 2560px) {
  .blawby-container {
    max-width: 96rem;
    padding-inline: 4rem;
  }
}

.blawby-display {
  font-family: Marcellus, Georgia, serif;
}

.blawby-shell .prose :where(h1, h2, h3, h4) {
  font-family: Marcellus, Georgia, serif;
}

.blawby-shell .prose.blawby-policy-prose :where(h1, h2, h3, h4) {
  font-family: Poppins, Arial, sans-serif;
}
</style>
