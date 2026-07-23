<template>
  <div class="blawby-shell blawby-theme min-h-screen bg-default text-default" :style="themeStyles" :data-hydrated="hydrated ? 'true' : 'false'">
    <!-- Teleport target for components (e.g. PlatformCommandSearchModal) that need to
         escape page overflow/stacking contexts but still must render inside this div to
         inherit the Blawby --ui-* and --blawby-* tokens. Teleporting straight to <body>
         puts them outside this scope entirely, which reads as the modal falling back to
         the platform's default (non-Blawby) theme — mirrors #saya-portal-root in
         layouts/saya.vue. Placed before the page content so it precedes any Teleport
         source in document order during SSR. -->
    <div id="blawby-portal-root" />

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
    <ConsentBanner variant="blawby" privacy-path="/policies/privacy" />
  </div>
</template>

<script setup lang="ts">
import ConsentBanner from '~/components/ConsentBanner.vue'

const { identity, navigation, consultation, compliance, themeTokens, offeringLinks } = await useBlawbyShell()
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })

// Every Blawby page/component builds and emits its own linked schema.org
// @graph via useProfessionalServiceSchema (which always includes the shared
// Organization/WebSite nodes) — see composables/useProfessionalServiceSchema.ts.
// The layout no longer emits its own ad hoc JSON-LD so there's exactly one
// canonical generation path for every route.

const themeStyles = computed(() => {
  const tokens = themeTokens.value
  return {
    '--blawby-token-bg': String(tokens.bg || '#fbfaf7'),
    '--blawby-token-surface': String(tokens.surface || '#ffffff'),
    '--blawby-token-primary': String(tokens.primary || '#25356c'),
    '--blawby-token-primary-dark': String(tokens.primaryDark || '#161f3b'),
    '--blawby-token-primary-100': String(tokens.primary100 || '#f2f5ff'),
    '--blawby-token-primary-200': String(tokens.primary200 || '#b4c5e5'),
    '--blawby-token-primary-800': String(tokens.primary800 || '#1d294f'),
    '--blawby-token-accent': String(tokens.accent || '#c19855'),
    '--blawby-token-accent-100': String(tokens.accent100 || '#faf5ea'),
    '--blawby-token-accent-200': String(tokens.accent200 || '#f8f0e1'),
    '--blawby-token-accent-button': String(tokens.accentButton || '#b58c4f'),
    '--blawby-token-accent-strong': String(tokens.accentStrong || '#a37732'),
    '--blawby-token-border': String(tokens.border || '#e5e7eb'),
    '--blawby-token-ink': String(tokens.ink || '#162033'),
  }
})

useHead(() => ({
  htmlAttrs: { class: 'blawby-document' },
}))
</script>
