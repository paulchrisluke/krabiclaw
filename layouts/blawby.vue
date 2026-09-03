<template>
  <div class="blawby-shell blawby-theme min-h-screen bg-default text-default" :style="themeStyles" :data-hydrated="hydrated ? 'true' : 'false'" :data-public-critical-shell="isHome ? 'true' : undefined">
    <!-- Teleport target for components (e.g. PlatformCommandSearchModal) that need to
         escape page overflow/stacking contexts but still must render inside this div to
         inherit the Blawby --ui-* and --blawby-* tokens. Teleporting straight to <body>
         puts them outside this scope entirely, which reads as the modal falling back to
         the platform's default (non-Blawby) theme — mirrors #saya-portal-root in
         layouts/saya.vue. Placed before the page content so it precedes any Teleport
         source in document order during SSR. -->
    <div id="blawby-portal-root" />

    <BlawbyHeader :site="identity" :consultation="consultation" :page-links="pageLinks" />
    <main>
      <slot />
    </main>
    <BlawbyFooter
      :site="identity"
      :compliance="compliance"
      :offering-links="offeringLinks"
      :page-links="pageLinks"
    />
  </div>
</template>

<script setup lang="ts">
import blawbyCriticalCss from '~/assets/css/blawby-critical.css?raw'
import '~/assets/css/blawby-entry.css'
import type { PublicBlawbyRouteData } from '~/types/blawby'

const route = useRoute()
const publicLocale = useState<string>('public-locale', () => 'en')
const isHome = computed(() => route.path === '/'
  || (publicLocale.value !== 'en' && route.path === `/${publicLocale.value}`)
  || /^\/preview\/(?:site|draft)\/[^/]+\/?$/.test(route.path))
const blawbyStylesheetHref = '/_nuxt/surfaces/blawby.css'
const blawbyStylesheetForRoute = computed(() => {
  return blawbyStylesheetHref
})

useHead(() => ({
  link: [
    {
      key: isHome.value ? 'blawby-home-stylesheet' : 'blawby-surface-stylesheet',
      rel: 'stylesheet',
      href: blawbyStylesheetForRoute.value,
    },
    { rel: 'preconnect', href: 'https://media.krabiclaw.com' },
  ],
  style: isHome.value
    ? [{ innerHTML: blawbyCriticalCss, tagPriority: 'critical' }]
    : [],
}))

const blawbyRoutePath = computed(() => resolveTenantLocalePath(
  route.path,
  publicLocale.value === 'en' ? [] : [publicLocale.value],
).sourcePath)
const target = resolveBlawbyRouteTarget(blawbyRoutePath.value, route.params)
const { data: document } = await useBlawbyDocument(target.recipe, target.slug)
if (target.recipe !== 'links') {
  useState<PublicBlawbyRouteData['localeRepresentations']>('public-locale-representations', () => []).value = document.value.route.localeRepresentations
}
provide('blawby-document', document)
const identity = computed(() => document.value.shell.identity)
const consultation = computed(() => document.value.shell.consultation)
const compliance = computed(() => document.value.shell.compliance)
const themeTokens = computed(() => document.value.shell.themeTokens)
const offeringLinks = computed(() => document.value.shell.offeringLinks)
const pageLinks = computed(() => document.value.shell.pageLinks)
provide('blawby-schema-context', { identity, compliance })
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
  htmlAttrs: { class: 'blawby-document', lang: publicLocale.value },
}))
</script>
