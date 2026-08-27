<template>
  <NuxtLoadingIndicator :color="loadingColor" :height="2" :throttle="150" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { calculateThemeColors } from '~/utils/color-utils'
import { buildTenantHeadLinks } from '~/utils/tenant-head'
import { TENANT_TYPES } from '~/utils/tenant-routing'

const { tenantType, isPlatform, site } = useTenantSite()
if (tenantType === TENANT_TYPES.TENANT_404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site Not Found',
  })
}

const { isBlawby } = usePublicTemplate()
const siteShell = isBlawby.value ? null : useSiteShellState()
const config = siteShell?.config
const route = useRoute()
const siteMedia = computed(() => siteShell?.site.value?.media ?? site?.media ?? [])
const tenantLogoUrl = computed(() => siteMedia.value.find(item => item.slot === 'logo')?.public_url ?? null)
const tenantFaviconUrl = computed(() => siteMedia.value.find(item => item.slot === 'favicon')?.public_url ?? null)
const tenantBrandName = computed(() => config?.value.brand_name || site?.brand_name || '')

useHead(() => {
  return {
    link: buildTenantHeadLinks({
      isPlatform,
      tenantLogoUrl: tenantLogoUrl.value,
      tenantFaviconUrl: tenantFaviconUrl.value,
      tenantBrandName: tenantBrandName.value,
      isDraftPreview: route.path.startsWith('/preview/draft/'),
      isSitePreview: route.path.startsWith('/preview/site/'),
    })
  }
})

// Google Analytics loads via Cloudflare Zaraz (edge-injected, see
// `useAnalytics.ts`'s `window.zaraz.track()` calls) — there is no
// client-bundled gtag.js/krabiLayer bootstrap here anymore. That removes the
// ~1.5s TTI cost the deferred-loading approach used to carry, since Zaraz's
// own snippet is edge-served and queues calls made before it loads the same
// way `dataLayer` does.

const loadingColor = computed(() => {
  if (isPlatform) return 'var(--kc-loading-rainbow)'
  return 'var(--saya-primary, var(--kc-coral))'
})

// Inject brand color CSS variables from site config. Must run inside a
// component (not a Nuxt plugin) — useBootstrap() depends on the active
// component instance provided by the application-owned i18n composable.
if (import.meta.client) {
  watchEffect(() => {
    const brandColor = config?.value.brand_color
    if (!brandColor) return
    try {
      const themeColors = calculateThemeColors(brandColor)
      const root = document.documentElement
      root.style.setProperty('--brand-color', themeColors.brandColor)
      root.style.setProperty('--brand-color-foreground', themeColors.brandColorForeground)
      root.style.setProperty('--brand-color-dark', themeColors.brandColorDark)
      root.style.setProperty('--brand-color-foreground-dark', themeColors.brandColorForegroundDark)
    } catch (error) {
      console.error('Failed to apply brand color theme:', error)
    }
  })
}
</script>
