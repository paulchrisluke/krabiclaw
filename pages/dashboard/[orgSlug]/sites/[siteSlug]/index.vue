<template>
  <UDashboardPanel id="site-overview">
    <template #header>
      <UDashboardNavbar
        :title="siteName"
        :toggle="false"
      >
        <template #leading><DashboardNavbarLeading :to="`${organizationPath}/sites`" label="Sites" /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-narrow,45rem)] pb-24">
        <div class="mb-3 flex items-center gap-2.5">
          <UTabs
            v-model="activeTab"
            :items="tabs"
            :content="false"
            variant="pill"
            class="min-w-0 flex-1"
            :ui="{ list: 'w-full', trigger: 'flex-1' }"
          />
          <UButton
            v-if="canManageSite"
            :to="`${siteDashboardPath}/settings`"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            square
            aria-label="Site settings"
          />
        </div>

        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="index in 6" :key="index" class="h-36 rounded-2xl" />
        </div>

        <div v-else-if="activeTab === 'site'" class="space-y-3">
          <section>
            <h2 class="mb-4 text-[15px] font-semibold text-highlighted">Locations</h2>
            <div v-if="locations.length" class="grid grid-cols-1 gap-y-5">
              <NuxtLink
                v-for="location in locations"
                :key="location.id"
                :to="`${locationsPath}/${location.slug}`"
                class="group relative aspect-[40/21] min-w-0 overflow-hidden rounded-2xl border border-default bg-elevated shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <img
                  v-if="locationMediaUrl(location)"
                  :src="locationMediaUrl(location)!"
                  :alt="`${location.title} preview`"
                  class="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  loading="lazy"
                  decoding="async"
                />
                <div v-else class="flex size-full items-center justify-center text-muted">
                  <UIcon name="i-lucide-image-off" class="size-8" />
                </div>
              </NuxtLink>
            </div>
            <UButton v-else :to="`${locationsPath}/new`" icon="i-lucide-plus" label="Add a location" color="neutral" variant="soft" />
          </section>

          <UCard class="overflow-hidden" :ui="{ header: 'p-0 sm:p-0', body: 'p-0 sm:p-0' }">
            <template #header>
              <NuxtLink :to="`${siteDashboardPath}/settings#brand`" class="flex min-h-14 items-center gap-3 px-5 py-4">
                <p class="min-w-0 flex-1 text-[15px] font-semibold text-highlighted">Brand</p>
                <p class="hidden max-w-72 truncate text-xs text-muted sm:block">{{ siteDomain }}</p>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
              </NuxtLink>
            </template>
            <NuxtLink :to="`${siteDashboardPath}/settings#brand`" class="block px-5 py-5 hover:bg-elevated">
              <div class="flex items-center gap-4">
                <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default" :style="!logoUrl ? { backgroundColor: settings?.brand_color } : undefined">
                  <img v-if="logoUrl" :src="logoUrl" :alt="`${siteName} logo`" class="size-full object-contain" />
                  <span v-else class="text-xl font-semibold text-white">{{ siteName.slice(0, 1) }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-base font-semibold text-highlighted">{{ siteName }}</p>
                  <p class="mt-1 line-clamp-2 text-sm leading-5 text-muted">{{ settings?.brand_description || 'Add your brand description' }}</p>
                </div>
              </div>
              <div class="mt-4 flex items-center gap-2 border-t border-default pt-4">
                <span class="size-5 rounded-md border border-default" :style="{ backgroundColor: settings?.brand_color }" />
                <span class="text-xs text-muted">{{ settings?.brand_color }}</span>
              </div>
              <p v-if="settings?.custom_domain_status !== 'active'" class="mt-4 flex items-center gap-2 text-xs font-medium text-warning">
                <UIcon name="i-lucide-circle-alert" class="size-4" /> Custom domain not connected
              </p>
            </NuxtLink>
          </UCard>

          <NuxtLink :to="`${siteDashboardPath}/media`" class="site-card group block">
              <div class="mb-3 flex items-baseline justify-between gap-4"><p class="text-[15px] font-semibold text-highlighted">Media library</p><p class="text-[13px] text-muted">{{ mediaSummary }}</p></div>
              <div v-if="media.length" class="grid grid-cols-5 gap-2">
                <div v-for="asset in media.slice(0, 5)" :key="asset.id" class="aspect-square overflow-hidden rounded-[10px] border border-default bg-muted"><img :src="asset.thumbnail_url || asset.public_url" alt="" class="size-full object-cover" /></div>
              </div>
          </NuxtLink>

          <NuxtLink :to="`${siteDashboardPath}/settings`" class="site-card group block">
            <p class="text-[15px] font-semibold text-highlighted">Site type</p><p class="mt-3 text-[15px] capitalize text-muted">{{ siteType }}</p>
          </NuxtLink>

          <div class="site-card flex flex-col gap-3">
            <NuxtLink :to="`${siteDashboardPath}/links`" class="group flex items-center justify-between gap-4"><p class="text-[15px] font-semibold text-highlighted">Links</p><p class="flex items-center gap-2 text-[13px] text-muted">{{ activeLinks.length ? `${activeLinks.length} links` : 'Add your first link' }}<UIcon name="i-lucide-chevron-right" class="size-[15px]" /></p></NuxtLink>
            <div class="space-y-2">
              <a v-for="link in activeLinks" :key="link.id" :href="link.destination" target="_blank" rel="noopener noreferrer" class="flex min-h-12 items-center gap-3 rounded-xl border border-default px-4 py-3 text-[13px] font-medium text-highlighted hover:text-primary">
                <UIcon :name="linkIcon(link.destination)" class="size-5 text-muted" /><span class="min-w-0 flex-1 truncate">{{ link.label }}</span><UIcon name="i-lucide-external-link" class="size-4 text-muted" />
              </a>
              <p v-if="!activeLinks.length" class="py-4 text-sm text-muted">No active links.</p>
            </div>
          </div>
        </div>

        <div v-else class="overflow-hidden rounded-2xl border border-default bg-default">
          <template v-for="page in pageRows" :key="page.id">
            <button
              v-if="page.module && !page.enabled"
              type="button"
              class="flex min-h-[66px] w-full items-center gap-4 border-b border-default px-4 text-left last:border-0 hover:bg-elevated"
              :disabled="togglingModule !== null"
              @click="enableModule(page.module)"
            >
              <UIcon :name="page.icon" class="size-5 text-dimmed" /><span class="min-w-0 flex-1 font-medium text-dimmed">{{ page.label }}</span>
            </button>
            <NuxtLink v-else :to="page.to" class="flex min-h-[66px] items-center gap-4 border-b border-default px-4 last:border-0 hover:bg-elevated">
              <UIcon :name="page.icon" class="size-5 text-muted" /><span class="min-w-0 flex-1 font-medium text-highlighted">{{ page.label }}</span><UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
            </NuxtLink>
          </template>
          <NuxtLink :to="`${siteDashboardPath}/pages`" class="flex min-h-[66px] items-center gap-4 border-2 border-dashed border-default px-4 text-muted hover:text-highlighted"><UIcon name="i-lucide-plus" class="size-5" /><span class="flex-1 font-medium">Add a page</span></NuxtLink>
        </div>
      </div>

      <div v-if="publicSiteUrl" class="pointer-events-none fixed inset-x-0 bottom-[calc(var(--kc-dashboard-bottom-nav)+1.25rem)] z-20 flex justify-center px-4 md:bottom-5">
        <UButton :to="publicSiteUrl" target="_blank" icon="i-lucide-external-link" label="View site" class="pointer-events-auto rounded-full px-5 shadow-lg" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { defaultModuleFeaturesForVertical, parseCmsFeatureOverrideDelta, resolveCmsCapabilities, templateCapabilityCatalog, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import type { DashboardHomeData } from '~/server/utils/dashboard-home'

const { organizationPath } = useDashboardPaths()

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'My site | KrabiClaw', robots: 'noindex, nofollow' })

const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const requestEvent = useRequestEvent()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
const route = useRoute()
const activeTab = ref<'site' | 'pages'>('site')
const tabs = [{ label: 'My site', value: 'site' as const }, { label: 'Pages', value: 'pages' as const }]
const siteDashboardPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}`)
const locationsPath = computed(() => `${siteDashboardPath.value}/locations`)
const siteName = computed(() => dashboard.site.value?.brand_name ?? '')
const canManageSite = computed(() => dashboard.siteAccess.value !== 'location')
const template = computed(() => resolvePublicTemplate({ vertical: dashboard.site.value?.vertical }).slug)
const vertical = computed(() => {
  const raw = dashboard.site.value?.vertical
  if (!raw) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  return normalizeVertical(raw) as SiteVertical
})
const capabilities = computed(() => resolveCmsCapabilities(vertical.value, template.value, { site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides) }))
const locationMediaUrl = (location: DashboardHomeData['locations'][number]) => {
  const media = location.media.find(item => item.slot === 'hero')
  if (media?.kind === 'video') return media?.thumbnail_url || null
  return media?.public_url || null
}

const { data: overviewData, pending } = await useAsyncData(`dashboard-home-${siteId}`, async (_nuxtApp, { signal }) => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const organization = dashboard.organization.value
    if (!organization) throw createError({ statusCode: 403, statusMessage: 'Dashboard organization unavailable' })
    const [{ cloudflareEnv }, { getDashboardHomeData }, { assertSiteWideAccess }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/dashboard-home'),
      import('~/server/utils/member-access'),
    ])
    const environment = cloudflareEnv(requestEvent)
    const db = environment.db
    if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
    await assertSiteWideAccess(db, {
      env: environment,
      memberId: organization.memberId,
      role: organization.role,
      organizationId: organization.id,
      siteId,
    })
    return await getDashboardHomeData(db, organization.id, siteId, {
      env: environment,
      memberId: organization.memberId,
      role: organization.role,
    })
  }
  return await dashboardApi<DashboardHomeData>('/api/dashboard/home', {
    signal,
    validate: (value): value is DashboardHomeData => isRecord(value)
      && Array.isArray(value.locations)
      && isRecord(value.operations)
      && isRecord(value.settings)
      && Array.isArray(value.pages)
      && Array.isArray(value.media)
      && Array.isArray(value.links),
  })
})
const overview = computed(() => {
  if (!overviewData.value) throw createError({ statusCode: 500, statusMessage: 'Site overview data is unavailable' })
  return overviewData.value
})
const locations = computed(() => overview.value.locations)
const settings = computed(() => overview.value.settings)
const logoUrl = computed(() => settings.value.media?.find(item => item.slot === 'logo')?.public_url ?? null)
const pages = computed(() => overview.value.pages)
const media = computed(() => overview.value.media)
const activeLinks = computed(() => overview.value.links.filter(item => item.status === 'active'))
const siteDomain = computed(() => dashboard.site.value?.custom_domain || dashboard.site.value?.public_url || '')
const publicSiteUrl = computed(() => dashboard.site.value?.public_url || '')
const siteType = computed(() => `${vertical.value.replaceAll('_', ' ')} · ${template.value} theme`)
const mediaSummary = computed(() => media.value.length ? `${media.value.length}${media.value.length === 6 ? '+' : ''} photos` : 'No media yet')
const pageIcons: Record<string, string> = { '/': 'i-lucide-house', '/about': 'i-lucide-info', '/contact': 'i-lucide-mail', '/menu': 'i-lucide-utensils', '/order': 'i-lucide-shopping-bag', '/reservations': 'i-lucide-calendar-check', '/experiences': 'i-lucide-ticket', '/services': 'i-lucide-briefcase', '/pricing': 'i-lucide-badge-dollar-sign', '/donate': 'i-lucide-heart-handshake', '/schedule': 'i-lucide-calendar-days', '/blog': 'i-lucide-newspaper' }
const featureByRoute: Record<string, ProductFeature> = { '/menu': 'products', '/products': 'products', '/order': 'ordering', '/reservations': 'reservations', '/experiences': 'experiences', '/services': 'services', '/pricing': 'services', '/donate': 'services', '/schedule': 'services' }
const primaryLocationPath = computed(() => {
  const location = locations.value.find(item => item.is_primary) ?? locations.value[0]
  return location ? `${locationsPath.value}/${location.slug}` : locationsPath.value
})
function pageDestination(path: string) {
  if (path === '/blog') return `${siteDashboardPath.value}/blog`
  if (path === '/menu' || path === '/products') return `${primaryLocationPath.value}/products`
  if (path === '/order') return `${siteDashboardPath.value}/orders`
  if (path === '/reservations') return `${primaryLocationPath.value}/reservations`
  if (path === '/experiences') return `${primaryLocationPath.value}/experiences`
  if (['/services', '/pricing', '/donate', '/schedule'].includes(path)) return `${siteDashboardPath.value}/professional-services`
  return `${siteDashboardPath.value}/pages`
}
const pageRows = computed(() => {
  const catalog = templateCapabilityCatalog[template.value]
  const documents = pages.value
    .filter(page => !featureByRoute[page.path])
    .map(page => ({
      id: page.id,
      label: catalog.pages.find(item => item.route === page.path)?.label ?? page.title,
      icon: pageIcons[page.path] || 'i-lucide-file-text',
      module: undefined,
      enabled: true,
      to: `${siteDashboardPath.value}/pages/${page.id}`,
    }))
  const managers = [...catalog.pages.filter(page => page.scope === 'site' && featureByRoute[page.route]), { id: 'blog', label: 'Blog', route: '/blog', feature: 'blog' as ProductFeature }].map(page => {
    const module = featureByRoute[page.route]
    const enabled = !module || capabilities.value.pages.some(item => item.scope === 'site' && item.route === page.route)
    return { id: page.id, label: page.label, icon: pageIcons[page.route] || 'i-lucide-file-text', module, enabled, to: pageDestination(page.route) }
  })
  return [...documents, ...managers]
})
const togglingModule = ref<ProductFeature | null>(null)
async function enableModule(feature: ProductFeature) {
  togglingModule.value = feature
  try {
    const defaults = new Set(defaultModuleFeaturesForVertical(vertical.value))
    const delta = parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides) ?? { enabled: [], disabled: [] }
    const enabled = new Set(delta.enabled ?? [])
    const disabled = new Set(delta.disabled ?? [])
    if (!defaults.has(feature)) enabled.add(feature)
    disabled.delete(feature)
    await dashboardApi<{ success: boolean }>('/api/dashboard/settings', {
      method: 'PATCH',
      body: { feature_overrides: { enabled: [...enabled], disabled: [...disabled] } },
      validate: (value): value is { success: boolean } => isRecord(value) && typeof value.success === 'boolean',
    })
    await dashboard.refresh()
  } finally { togglingModule.value = null }
}

function linkIcon(destination: string) { try { const host = new URL(destination).hostname.replace(/^www\./, ''); if (host.endsWith('facebook.com')) return 'i-simple-icons-facebook'; if (host.endsWith('instagram.com')) return 'i-simple-icons-instagram'; if (host.endsWith('tiktok.com')) return 'i-simple-icons-tiktok'; if (host.endsWith('youtube.com') || host === 'youtu.be') return 'i-simple-icons-youtube' } catch { return 'i-lucide-link' } return 'i-lucide-link' }
</script>

<style scoped>
.site-card { padding: 20px; border: 1px solid var(--ui-border); border-radius: 16px; background: var(--ui-bg-elevated); color: var(--ui-text); transition: border-color 150ms ease; }
.site-card:hover { border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border)); }
@media (max-width: 767px) { .site-card { padding: 18px; } }
@media (max-width: 639px) { .site-card { padding: 16px; } }
</style>
