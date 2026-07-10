<template>
  <div class="blawby-shell min-h-screen bg-[var(--blawby-bg)] text-[var(--blawby-ink)]" :style="themeStyles">
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
  </div>
</template>

<script setup lang="ts">
const { identity, navigation, consultation, compliance, themeTokens, offeringLinks } = await useBlawbyShell()
const requestUrl = useRequestURL()

function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case '<': return '\\u003c'
      case '>': return '\\u003e'
      case '&': return '\\u0026'
      case '\u2028': return '\\u2028'
      case '\u2029': return '\\u2029'
      default: return char
    }
  })
}

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
    '--blawby-accent-strong': String(tokens.accentStrong || '#a37732'),
    '--blawby-border': String(tokens.border || '#e5e7eb'),
    '--blawby-ink': String(tokens.ink || '#162033'),
  }
})

useHead(() => ({
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
.blawby-shell {
  font-family: Poppins, ui-sans-serif, system-ui, sans-serif;
}

.blawby-display {
  font-family: Marcellus, Georgia, serif;
}

.blawby-shell .prose :where(h1, h2, h3, h4) {
  font-family: Marcellus, Georgia, serif;
}
</style>
