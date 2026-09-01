<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <LocalizedResourcePage
      v-if="localizedRoute?.representation.kind === 'resource'"
      :route="localizedRoute"
    />
    <LocationQaPage
      v-else-if="localizedRoute?.representation.kind === 'location_subpage' && localizedRoute.representation.sub_page === 'qa'"
    />
    <LocationPhotosPage
      v-else-if="localizedRoute?.representation.kind === 'location_subpage' && localizedRoute.representation.sub_page === 'photos'"
    />
    <TenantPublicPage
      v-else
      :path="tenantPagePath"
      :locale="localizedRoute?.locale"
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { LocalizedPublicRoute } from '~/server/utils/localization'
import { isRecord, publicApiRequest } from '~/utils/api-clients'
import { splitLocalePrefix } from '~/utils/tenant-locale-path'

definePageMeta({ layout: false })

const route = useRoute()
const { isPlatform, isTenant, siteId } = useTenantSite()
const { isBlawby } = usePublicTemplate()
if (isPlatform || !isTenant || !siteId) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const segments = route.params.tenantPath
const pagePath = computed(() => {
  const values = Array.isArray(segments) ? segments : [String(segments || '')]
  return '/' + values.filter(Boolean).join('/')
})

const localePrefix = computed(() => splitLocalePrefix(pagePath.value))
const localeSegment = computed(() => localePrefix.value.localeSegment)
const tenantPagePath = computed(() => localePrefix.value.tenantPagePath)
const requestEvent = useRequestEvent()
const isLocalizedRouteResponse = (value: unknown): value is { route: LocalizedPublicRoute } =>
  isRecord(value) && isRecord(value.route) && typeof value.route.locale === 'string'
const localizedData = localeSegment.value
  ? await useAsyncData<{ route: LocalizedPublicRoute }>(`localized-route-${siteId}-${pagePath.value}`, async () => {
      if (import.meta.server) {
        if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
        const [{ cloudflareEnv }, { queryFirst }, { resolveLocalizedPublicRoute }] = await Promise.all([
          import('~/server/utils/api-response'),
          import('~/server/db'),
          import('~/server/utils/localization'),
        ])
        const db = cloudflareEnv(requestEvent).db
        if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
        const currentSite = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ? AND status = \'active\' LIMIT 1', [siteId])
        if (!currentSite) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
        return { route: await resolveLocalizedPublicRoute(db, currentSite.organization_id, siteId, pagePath.value) }
      }
      const endpoint: string = `/api/public/sites/${encodeURIComponent(siteId)}/localized-route`
      return await publicApiRequest(endpoint, {
        query: { path: pagePath.value },
        validate: isLocalizedRouteResponse,
      })
    }, { server: true, lazy: false })
  : null
if (localizedData?.error.value) throw localizedData.error.value
const localizedRoute = computed(() => localizedData?.data.value?.route ?? null)
if (localeSegment.value && !localizedRoute.value) throw createError({ statusCode: 404, statusMessage: 'Localized route not found' })
if (localizedRoute.value) {
  // Set the i18n locale imperatively here, synchronously, rather than via a
  // reactive useState + watch bridge — this script setup fully resolves before
  // any descendant (header/footer, which call t()) renders, so this is the one
  // point guaranteed to run in time regardless of SSR watcher flush timing.
  const { $setAppLocale } = useNuxtApp() as { $setAppLocale?: (locale: string, messages: Record<string, string> | null) => void }
  if (!$setAppLocale) throw new Error('Application locale setter is unavailable')
  $setAppLocale(localizedRoute.value.locale, localizedRoute.value.platform_messages)
  useHead({
    htmlAttrs: { lang: localizedRoute.value.locale },
    link: [{ rel: 'alternate', hreflang: localizedRoute.value.locale, href: localizedRoute.value.route_path }],
  })
}
</script>
