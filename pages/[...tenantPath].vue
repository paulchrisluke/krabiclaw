<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <template v-if="localizedRoute && tenantPagePath === '/'">
      <LazyBlawbyHome v-if="isBlawby" />
      <LazySayaHomePage v-else />
    </template>
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
import { resolveTenantLocalePath } from '~/utils/tenant-locale-path'

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

const requestEvent = useRequestEvent()
const isPublicLocalesResponse = (value: unknown): value is { locales: Array<{ code: string; status: string; is_source: boolean }> } =>
  isRecord(value) && Array.isArray(value.locales) && value.locales.every(item => isRecord(item)
    && typeof item.code === 'string' && typeof item.status === 'string' && typeof item.is_source === 'boolean')
const { data: publishedLocales, error: publishedLocalesError } = await useAsyncData(
  `published-locales-${siteId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const [{ cloudflareEnv }, { queryAll }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/db'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 503, statusMessage: 'Database unavailable' })
      const rows = await queryAll<{ locale: string }>(db, `
        SELECT locale FROM site_locales
         WHERE site_id = ? AND is_source = 0 AND status = 'published'
         ORDER BY locale
      `, [siteId])
      return rows.map(row => row.locale)
    }
    const response = await publicApiRequest(`/api/public/sites/${encodeURIComponent(siteId)}/locales`, {
      validate: isPublicLocalesResponse,
    })
    return response.locales.filter(item => !item.is_source && item.status === 'published').map(item => item.code)
  },
  { server: true, lazy: false },
)
if (publishedLocalesError.value) throw publishedLocalesError.value
const localePath = computed(() => resolveTenantLocalePath(pagePath.value, publishedLocales.value ?? []))
const localeSegment = computed(() => localePath.value.localeSegment)
const tenantPagePath = computed(() => localePath.value.sourcePath)
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
if (localizedRoute.value?.representation.kind === 'resource') {
  throw createError({ statusCode: 404, statusMessage: 'Localized resource route is not handled by the tenant page catch-all' })
}
if (localizedRoute.value) {
  useState<string>('public-locale', () => 'en').value = localizedRoute.value.locale
  useState<Record<string, string> | null>('platform-locale-messages', () => null).value = localizedRoute.value.platform_messages
  useState<LocalizedPublicRoute['locale_representations']>('public-locale-representations', () => []).value = localizedRoute.value.locale_representations
  useHead({
    htmlAttrs: { lang: localizedRoute.value.locale },
    link: [{ rel: 'alternate', hreflang: localizedRoute.value.locale, href: localizedRoute.value.route_path }],
  })
}
</script>
