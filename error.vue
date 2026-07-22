<template>
  <div class="min-h-screen flex items-center justify-center bg-default px-6 py-12">
    <div class="w-full max-w-sm text-center">
      <img src="/krabi-claw-logo.png" alt="KrabiClaw Logo" class="h-8 mb-6 mx-auto">

      <p class="text-sm font-medium text-dimmed uppercase tracking-[0.18em] mb-2">
        Error {{ error.statusCode }}
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

      <div v-if="isDev" class="mt-8 text-left rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-mono text-red-700 whitespace-pre-wrap">
        <p>Message: {{ error.message }}</p>
        <p v-if="error.stack" class="mt-2">Stack: {{ error.stack }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { buildTenantHeadLinks } from '~/utils/tenant-head'

const props = defineProps({
  error: Object
})

const isDev = import.meta.dev
const isNotFound = computed(() => props.error?.statusCode === 404)

// Tenant-resolution middleware still runs before app.vue throws, so `site` is
// populated whenever the host resolved to a real tenant (e.g. a 500 on a known
// site, or an unauthorized draft preview). It's only ever null for a genuine
// TENANT_404 (host never matched any site_domains row). Reusing the same
// buildTenantHeadLinks() as app.vue means a resolved tenant's error page keeps
// showing its own favicon, and an unresolved custom domain gets the generic
// branded-letter fallback instead of silently inheriting KrabiClaw's own
// favicon.ico via the browser's implicit lookup.
const { isPlatform, site } = useTenantSite()
const route = useRoute()

useHead(() => ({
  link: buildTenantHeadLinks({
    isPlatform,
    tenantLogoUrl: site?.logo_url || null,
    tenantLogoMimeType: site?.logo_mime_type || null,
    tenantBrandName: site?.brand_name || '',
    tenantFaviconUrl: site?.favicon_url || null,
    isDraftPreview: route.path.startsWith('/preview/draft/'),
  })
}))
</script>
