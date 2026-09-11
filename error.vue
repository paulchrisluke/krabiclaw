<template>
  <div class="min-h-screen flex items-center justify-center bg-default px-6 py-12">
    <div class="w-full max-w-sm text-center">
      <img src="/krabi-claw-logo.png" alt="KrabiClaw Logo" class="h-8 mb-6 mx-auto">

      <p class="text-sm font-medium text-dimmed uppercase tracking-[0.18em] mb-2">
        Error {{ errorStatusCode }}
      </p>
      <h1 class="text-2xl font-bold text-default tracking-tight mb-2">
        {{ isNotFound ? "Page not found" : "Something went wrong" }}
      </h1>
      <p class="text-sm text-muted mb-8">
        {{ isNotFound
          ? "The page you're looking for doesn't exist or may have moved."
          : "We hit an unexpected error. Please try again." }}
      </p>

      <PlatformButton size="lg" class="rounded-full" @click="clearError({ redirect: '/' })">
        Go back home
      </PlatformButton>
    </div>
  </div>
</template>

<script setup>
import { buildTenantHeadLinks } from '~/utils/tenant-head'
import { publicSurfaceStylesheetForRequest } from '~/utils/public-surface-hints'

const props = defineProps({
  error: Object
})

const errorStatusCode = computed(() => props.error?.statusCode ?? props.error?.status ?? 500)
const isNotFound = computed(() => errorStatusCode.value === 404)

const { isPlatform, tenantType, themeId, site } = useTenantSite()
const route = useRoute()

// Nuxt renders this page outside the layout system, so the surface CSS a layout
// would import never loads and production served the error page in Times with
// no tokens at all. Dev hid it, because Vite injects every stylesheet there.
// The surface is resolved rather than hardcoded, since tenant sites 404 through
// this same component and must not be handed the platform sheet.
const surfaceStylesheet = computed(() => {
  try {
    return publicSurfaceStylesheetForRequest({
      pathname: route.path,
      tenantType,
      themeId,
      vertical: site?.vertical,
    })
  } catch {
    // An unsupported template must not throw while already rendering an error.
    return null
  }
})

// The platform owns html.dark through this composable. Without it the error
// page cannot honour a light or dark preference.
if (isPlatform) usePlatformTheme()

useHead(() => ({
  link: [
    ...(surfaceStylesheet.value ? [{ rel: 'stylesheet', href: surfaceStylesheet.value }] : []),
    ...buildTenantHeadLinks({
      isPlatform,
      siteMedia: site?.media,
    }),
  ],
}))
</script>
