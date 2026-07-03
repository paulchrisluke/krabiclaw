<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="themeStyles"
  >
    <SayaHeader :site="site" :locations="locations" :menu="menu" :has-experiences="hasExperiences" />
    <main class="grow">
      <slot />
    </main>
    <LazySayaFooter
      :site="site"
      :is-platform="isPlatform"
      :locations="locations"
      :locales="locales"
      :error="bootstrapError"
      :config="config"
      :menu="menu"
      :has-experiences="hasExperiences"
    />
  </div>
</template>

<script setup>
if (import.meta.dev) useDebugLCP()

// Single owner of the shared bootstrap/tenant-site fetch for this tree —
// header/footer receive the fields they need as props instead of each
// independently calling useBootstrap()/useTenantSite() and relying on
// cache-key coincidence to dedupe.
const { config, locations, menu, hasExperiences, locales, error: bootstrapError } = useBootstrap()
const { siteId, isTenant, isPlatform, site } = useTenantSite()

// The full bootstrap payload above is intentionally `lazy: true` (see
// useBootstrap.ts) so SSR doesn't block the whole page on it. But that means
// brand_color isn't known yet on first paint, and the CTA button's Tailwind
// class falls back to Nuxt UI's default color, then snaps to the real brand
// color once bootstrap resolves client-side — a visible flash of the wrong
// color. This tiny, non-lazy fetch blocks SSR just long enough to know the
// real brand_color before anything paints, so no fallback color is ever shown.
const { data: brandConfigData } = isTenant && siteId
  ? await useFetch(`/api/public/sites/${siteId}/config`, {
      key: `site-brand-config-${siteId}`,
    })
  : { data: ref(null) }

const brandColor = computed(
  () => brandConfigData.value?.config?.brand_color || config.value?.brand_color || null
)
const brandTextColor = computed(() => getContrastColor(brandColor.value))

const themeStyles = computed(() => {
  if (!brandColor.value) return {}
  return {
    '--brand-color': brandColor.value,
    '--brand-color-foreground': brandTextColor.value,
  }
})

const googleAnalyticsId = computed(() => config.value?.google_analytics_measurement_id || null)
const googleSiteVerification = computed(() => config.value?.google_site_verification || null)

const ogTitle = computed(() => config.value?.brand_name || null)
const ogDescription = computed(() => truncateForSeo(config.value?.brand_description, 160) || null)
const ogImage = computed(() =>
  config.value?.og_image_url ||
  locations.value[0]?.hero_image_public_url ||
  config.value?.logo_url ||
  null
)

function isValidGoogleAnalyticsId(id) {
  if (!id || typeof id !== 'string') return false
  return /^G-[A-Z0-9]+$/.test(id) || /^UA-\d+-\d+$/.test(id)
}

const validGoogleAnalyticsId = computed(() => {
  const id = googleAnalyticsId.value
  return isValidGoogleAnalyticsId(id) ? id : null
})

useHead(() => {
  const meta = []
  const link = []
  const script = []

  meta.push({ property: 'og:type', content: 'website' })
  meta.push({ name: 'twitter:card', content: 'summary_large_image' })
  if (ogTitle.value) {
    meta.push({ property: 'og:title', content: ogTitle.value })
    meta.push({ name: 'twitter:title', content: ogTitle.value })
    meta.push({ property: 'og:site_name', content: ogTitle.value })
  }
  if (ogDescription.value) {
    meta.push({ property: 'og:description', content: ogDescription.value })
    meta.push({ name: 'twitter:description', content: ogDescription.value })
  }
  if (ogImage.value) meta.push({ property: 'og:image', content: ogImage.value })

  if (googleSiteVerification.value) {
    meta.push({
      name: 'google-site-verification',
      content: googleSiteVerification.value
    })
  }
  if (validGoogleAnalyticsId.value) {
    const id = validGoogleAnalyticsId.value
    script.push({
      src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`,
      async: true
    })
    script.push({
      key: 'saya-google-analytics-init',
      innerHTML: `window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${id}');`
    })
  }

  return {
    meta,
    link,
    script,
    __dangerouslyDisableSanitizersByTagID: {
      'saya-google-analytics-init': ['innerHTML']
    }
  }
})
</script>

<style>
/* Saya theme CSS variables */
.saya-theme {
  --brand-color: var(--brand-color, #16a34a);
}
</style>
