<template>
  <div class="blawby-shell min-h-screen bg-[var(--blawby-bg)] text-[var(--blawby-ink)]" :style="themeStyles">
    <BlawbyHeader :site="site" :navigation="navigation" :consultation="consultation" />
    <main>
      <slot />
    </main>
    <BlawbyFooter :site="site" :navigation="navigation" :compliance="compliance" />
  </div>
</template>

<script setup lang="ts">
const { site } = useTenantSite()
const { navigation, consultation, compliance, themeTokens } = useBlawbySite()
const requestUrl = useRequestURL()

const themeStyles = computed(() => {
  const tokens = themeTokens.value
  return {
    '--blawby-bg': String(tokens.bg || '#fbfaf7'),
    '--blawby-surface': String(tokens.surface || '#ffffff'),
    '--blawby-primary': String(tokens.primary || '#25356c'),
    '--blawby-primary-dark': String(tokens.primaryDark || '#161f3b'),
    '--blawby-accent': String(tokens.accent || '#c19855'),
    '--blawby-accent-strong': String(tokens.accentStrong || '#a37732'),
    '--blawby-border': String(tokens.border || '#e7ddcc'),
    '--blawby-ink': String(tokens.ink || '#162033'),
  }
})

useHead(() => ({
  link: Array.isArray(themeTokens.value.fonts)
    ? themeTokens.value.fonts.map((href: unknown) => ({ rel: 'stylesheet', href: String(href) }))
    : [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Marcellus&family=Poppins:wght@400;600&display=swap' }],
  script: [{
    type: 'application/ld+json',
    children: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': ['ProfessionalService', 'Organization'],
      name: site?.brand_name || compliance.value?.entity_name || 'Professional services',
      description: site?.brand_description || compliance.value?.disclaimer || undefined,
      url: requestUrl.origin,
      logo: site?.logo_url || undefined,
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
