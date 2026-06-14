<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="themeStyles"
  >
    <UTheme :ui="{}">
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
    '--brand-text-color': brandTextColor.value
  }
})

const googleAnalyticsId = computed(() => config.value?.google_analytics_measurement_id || null)
const googleSiteVerification = computed(() => config.value?.google_site_verification || null)

const ogTitle = computed(() => config.value?.brand_name || null)
const ogDescription = computed(() => config.value?.brand_description || null)
const ogImage = computed(() => (locations.value[0] as Record<string, unknown>)?.hero_image_public_url as string | null || null)
const faviconUrl = computed(() => config.value?.logo_url || null)

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
  if (ogTitle.value) meta.push({ property: 'og:title', content: ogTitle.value })
  if (ogDescription.value) meta.push({ property: 'og:description', content: ogDescription.value })
  if (ogImage.value) meta.push({ property: 'og:image', content: ogImage.value })
  if (faviconUrl.value) link.push({ rel: 'icon', href: faviconUrl.value })

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

/* Tenant-specific base styles for accessibility */
.saya-theme .u-button-solid-primary,
.saya-theme .u-button-solid-primary *,
.saya-theme .u-button--solid.u-button--primary,
.saya-theme .u-button--solid.u-button--primary * {
  color: var(--brand-text-color, white) !important;
}

/* Ensure icons also inherit the contrast color when in a primary button */
.saya-theme .u-button-solid-primary .u-icon,
.saya-theme .u-button--solid.u-button--primary .u-icon {
  color: var(--brand-text-color, white) !important;
}
</style>
