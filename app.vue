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

const { tenantType, isPlatform, organization } = useTenantOrganization()
if (tenantType === TENANT_TYPES.TENANT_404) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Site Not Found',
  })
}

const { isBlawby } = usePublicTemplate()
const organizationShell = isBlawby.value ? null : useOrganizationShellState()
const config = organizationShell?.config
const organizationMedia = computed(() => organizationShell?.organization.value?.media ?? organization?.media ?? [])
useHead(() => {
  const verification = config?.value.search_console_verification
  return {
    link: buildTenantHeadLinks({
      isPlatform,
      organizationMedia: organizationMedia.value,
    }),
    // Google fetches the organization's domain to verify Search Console
    // ownership (server/utils/google-search-console.ts); every public layout
    // carries it. Blawby serves its own from its document shell.
    meta: verification ? [{ name: 'google-site-verification', content: verification }] : [],
  }
})

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
    // A brand colour the tenant saved that cannot be turned into a theme is a
    // stored value that is wrong, and swallowing it painted every page in the
    // platform default while the dashboard showed their colour set.
    const themeColors = calculateThemeColors(brandColor)
    const root = document.documentElement
    root.style.setProperty('--brand-color', themeColors.brandColor)
    root.style.setProperty('--brand-color-foreground', themeColors.brandColorForeground)
    root.style.setProperty('--brand-color-dark', themeColors.brandColorDark)
    root.style.setProperty('--brand-color-foreground-dark', themeColors.brandColorForegroundDark)
  })
}
</script>
