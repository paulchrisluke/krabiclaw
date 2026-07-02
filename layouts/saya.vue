<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="themeStyles"
  >
    <UTheme :ui="{ button: { compoundVariants: [{ color: 'primary', variant: 'solid', class: 'text-[var(--brand-color-foreground,white)] bg-[var(--brand-color,var(--color-primary-500))] hover:bg-[var(--brand-color,var(--color-primary-600))]/75 active:bg-[var(--brand-color,var(--color-primary-600))]/75 disabled:bg-[var(--brand-color,var(--color-primary-500))] aria-disabled:bg-[var(--brand-color,var(--color-primary-500))] outline-[var(--brand-color,var(--color-primary-500))]/25 focus-visible:outline-3' }] } }">
      <SayaHeader />
      <main class="grow">
        <slot />
      </main>
      <LazySayaFooter />
      <LazySayaUpgradeModal />
    </UTheme>
  </div>
</template>

<script setup>
if (import.meta.dev) useDebugLCP()

const { config, locations } = useBootstrap()

const brandColor = computed(() => config.value?.brand_color || null)
const brandTextColor = computed(() => getContrastColor(brandColor.value))

const themeStyles = computed(() => {
  if (!brandColor.value) return {}
  return {
    '--brand-color': brandColor.value,
    '--ui-primary': brandColor.value,
    '--color-primary': brandColor.value,
    '--brand-color-foreground': brandTextColor.value,
    // Ensure Nuxt UI primary color resolves correctly
    '--primary': brandColor.value,
    '--primary-foreground': brandTextColor.value
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
/* Nuxt UI v3 uses these variables for the primary color palette */
.saya-theme {
  --ui-primary: var(--brand-color);
  --color-primary: var(--brand-color);
}
</style>
