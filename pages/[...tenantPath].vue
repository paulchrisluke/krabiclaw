<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
    <LocalizedResourcePage
      v-if="localizedRoute?.representation.kind === 'resource'"
      :route="localizedRoute"
    />
    <TenantPublicPage
      v-else
      :path="pagePath"
      :locale="localizedRoute?.locale"
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { LocalizedPublicRoute } from '~/server/utils/localization'
import { isRecord, publicApiRequest } from '~/utils/api-clients'

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

const localeSegment = computed(() => {
  const first = pagePath.value.split('/')[1]
  if (!first || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(first)) return null
  try {
    const canonical = Intl.getCanonicalLocales(first)
    return canonical.length === 1 && canonical[0] === first ? first : null
  } catch {
    return null
  }
})
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
  useState<string>('public-locale', () => 'en').value = localizedRoute.value.locale
  useState<Record<string, string> | null>('platform-locale-messages', () => null).value = localizedRoute.value.platform_messages
  useState<Record<string, string> | null>('localized-site-values', () => null).value = localizedRoute.value.site.values as Record<string, string>
  useHead({
    htmlAttrs: { lang: localizedRoute.value.locale },
    link: [{ rel: 'alternate', hreflang: localizedRoute.value.locale, href: localizedRoute.value.route_path }],
  })
}
</script>
