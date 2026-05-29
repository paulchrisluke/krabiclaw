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
const { config } = useBootstrap()

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

function isValidGoogleAnalyticsId(id) {
  if (!id || typeof id !== 'string') return false
  return /^G-[A-Z0-9]+$/.test(id) || /^UA-\d+-\d+$/.test(id)
}

const validGoogleAnalyticsId = computed(() => {
  const id = googleAnalyticsId.value
  return isValidGoogleAnalyticsId(id) ? id : null
})

const lastRegisteredGaId = ref(null)
watch(validGoogleAnalyticsId, (newId) => {
  if (newId && newId !== lastRegisteredGaId.value) {
    useScriptGoogleAnalytics({ id: newId })
    lastRegisteredGaId.value = newId
  }
}, { immediate: true })

useHead(() => {
  const meta = []
  if (googleSiteVerification.value) {
    meta.push({
      name: 'google-site-verification',
      content: googleSiteVerification.value
    })
  }

  return {
    meta
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
