<template>
  <UDashboardPanel id="site-overview">
    <template #header>
      <UDashboardNavbar :title="siteName">
        <template #leading><DashboardSidebarCollapseButton /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-narrow,45rem)] pb-24">
        <div class="mb-6 flex items-center gap-2">
          <div class="grid flex-1 grid-cols-2 rounded-full bg-elevated p-1">
            <button
              v-for="item in tabs"
              :key="item.value"
              type="button"
              class="rounded-full px-4 py-2 text-sm font-semibold transition"
              :class="activeTab === item.value ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:text-highlighted'"
              @click="activeTab = item.value"
            >
              {{ item.label }}
            </button>
          </div>
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

        <div v-if="pending || supportingPending" class="space-y-4">
          <USkeleton v-for="index in 6" :key="index" class="h-36 rounded-2xl" />
        </div>

        <UAlert
          v-else-if="supportingError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Site details are unavailable"
          :description="supportingError"
        />

        <div v-else-if="activeTab === 'site'" class="space-y-4">
          <NuxtLink :to="`${siteDashboardPath}/pages`" class="group block">
            <UCard class="transition group-hover:border-primary/50">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-muted">Publication</p>
                  <p class="mt-2 flex items-center gap-2 text-lg font-semibold text-highlighted">
                    <UIcon :name="homePage?.status === 'published' ? 'i-lucide-circle-check' : 'i-lucide-circle-dot-dashed'" class="size-5" />
                    {{ homePage?.status === 'published' ? 'Live' : 'Draft' }}
                  </p>
                  <p class="mt-1 text-sm text-muted">{{ publicationConsequence }}</p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="mt-1 size-5 text-muted transition group-hover:translate-x-0.5" />
              </div>
            </UCard>
          </NuxtLink>

          <UCard>
            <template #header>
              <NuxtLink :to="locationsPath" class="group flex items-center justify-between gap-4">
                <div>
                  <p class="font-semibold text-highlighted">Site tour</p>
                  <p class="mt-1 text-sm text-muted">{{ siteTourSummary }}</p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" />
              </NuxtLink>
            </template>
            <div v-if="locations.length" class="divide-y divide-default">
              <NuxtLink
                v-for="location in locations"
                :key="location.id"
                :to="`${locationsPath}/${location.slug}`"
                class="group flex min-h-16 items-center gap-4 py-3"
              >
                <div class="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <img v-if="location.hero_url" :src="cfImageVariant(location.hero_url, { width: 160 }) ?? undefined" :alt="location.title" class="size-full object-cover" />
                  <div v-else class="flex size-full items-center justify-center"><UIcon name="i-lucide-map-pin" class="size-5 text-muted" /></div>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate font-medium text-highlighted">{{ location.title }}</p>
                    <UBadge v-if="location.is_primary" size="xs" color="primary" variant="soft">Primary</UBadge>
                  </div>
                  <p class="mt-1 truncate text-sm text-muted">{{ locationAddress(location) }}</p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-muted transition group-hover:translate-x-0.5" />
              </NuxtLink>
            </div>
            <div v-else class="py-5 text-sm text-muted">No locations yet.</div>
          </UCard>

          <NuxtLink :to="`${siteDashboardPath}/settings#brand`" class="group block">
            <UCard class="overflow-hidden transition group-hover:border-primary/50" :ui="{ body: 'p-0 sm:p-0' }">
              <div v-if="brandCover" class="h-32 overflow-hidden bg-muted"><img :src="brandCover" alt="" class="size-full object-cover" /></div>
              <div class="p-5">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex min-w-0 gap-3">
                    <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default">
                      <img v-if="settings?.logo_url" :src="settings.logo_url" :alt="`${siteName} logo`" class="size-full object-contain" />
                      <UIcon v-else name="i-lucide-image" class="size-5 text-muted" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-2"><p class="font-semibold text-highlighted">Brand</p><span v-if="settings?.brand_color" class="size-3 rounded-full border border-default" :style="{ backgroundColor: settings.brand_color }" /></div>
                      <p class="mt-1 line-clamp-2 text-sm text-muted">{{ settings?.brand_description || 'Add your brand description' }}</p>
                      <p class="mt-2 truncate text-xs text-muted">{{ siteDomain }}</p>
                    </div>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" />
                </div>
                <p v-if="settings?.custom_domain_status !== 'active'" class="mt-4 flex items-center gap-2 text-xs font-medium text-warning">
                  <UIcon name="i-lucide-circle-alert" class="size-4" /> Custom domain not connected
                </p>
              </div>
            </UCard>
          </NuxtLink>

          <NuxtLink v-for="hero in heroCards" :key="hero.label" :to="`${siteDashboardPath}/pages`" class="group block">
            <UCard class="transition group-hover:border-primary/50">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ hero.label }}</p>
                  <p class="mt-3 text-2xl text-highlighted" :class="hero.italic ? 'font-serif italic' : 'font-serif'">{{ hero.value }}</p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" />
              </div>
            </UCard>
          </NuxtLink>

          <NuxtLink :to="`${siteDashboardPath}/media`" class="group block">
            <UCard class="transition group-hover:border-primary/50">
              <div class="mb-4 flex items-center justify-between gap-4"><div><p class="font-semibold text-highlighted">Media library</p><p class="mt-1 text-sm text-muted">{{ mediaSummary }}</p></div><UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" /></div>
              <div v-if="media.length" class="grid grid-cols-5 gap-2">
                <div v-for="asset in media.slice(0, 5)" :key="asset.id" class="aspect-square overflow-hidden rounded-lg bg-muted"><img :src="asset.thumbnail_url || asset.public_url" alt="" class="size-full object-cover" /></div>
              </div>
            </UCard>
          </NuxtLink>

          <NuxtLink :to="`${siteDashboardPath}/settings`" class="group block">
            <UCard class="transition group-hover:border-primary/50"><div class="flex items-center justify-between gap-4"><div><p class="font-semibold text-highlighted">Site type</p><p class="mt-1 text-sm capitalize text-muted">{{ siteType }}</p></div><UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" /></div></UCard>
          </NuxtLink>

          <UCard>
            <template #header><NuxtLink :to="`${siteDashboardPath}/links`" class="group flex items-center justify-between gap-4"><div><p class="font-semibold text-highlighted">Links</p><p class="mt-1 text-sm text-muted">{{ activeLinks.length ? `${activeLinks.length} active` : 'Add your first link' }}</p></div><UIcon name="i-lucide-chevron-right" class="size-5 text-muted transition group-hover:translate-x-0.5" /></NuxtLink></template>
            <div class="divide-y divide-default">
              <a v-for="link in activeLinks" :key="link.id" :href="link.destination" target="_blank" rel="noopener noreferrer" class="flex min-h-12 items-center gap-3 py-3 text-sm font-medium text-highlighted hover:text-primary">
                <UIcon :name="linkIcon(link.destination)" class="size-5 text-muted" /><span class="min-w-0 flex-1 truncate">{{ link.label }}</span><UIcon name="i-lucide-external-link" class="size-4 text-muted" />
              </a>
              <p v-if="!activeLinks.length" class="py-4 text-sm text-muted">No active links.</p>
            </div>
          </UCard>
        </div>

        <div v-else class="overflow-hidden rounded-2xl border border-default bg-default">
          <template v-for="page in pageRows" :key="page.id">
            <button
              v-if="page.module && page.status === 'off'"
              type="button"
              class="flex min-h-[66px] w-full items-center gap-4 border-b border-default px-4 text-left last:border-0 hover:bg-elevated"
              :disabled="togglingModule !== null"
              @click="enableModule(page.module)"
            >
              <UIcon :name="page.icon" class="size-5 text-dimmed" /><span class="min-w-0 flex-1 font-medium text-dimmed">{{ page.label }}</span><UBadge color="neutral" variant="soft">Off</UBadge>
            </button>
            <NuxtLink v-else :to="page.to" class="flex min-h-[66px] items-center gap-4 border-b border-default px-4 last:border-0 hover:bg-elevated">
              <UIcon :name="page.icon" class="size-5 text-muted" /><span class="min-w-0 flex-1 font-medium text-highlighted">{{ page.label }}</span><UBadge :color="page.status === 'live' ? 'success' : 'warning'" variant="soft">{{ page.status === 'live' ? 'Live' : 'Draft' }}</UBadge><UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
            </NuxtLink>
          </template>
          <NuxtLink :to="`${siteDashboardPath}/pages`" class="flex min-h-[66px] items-center gap-4 border-2 border-dashed border-default px-4 text-muted hover:text-highlighted"><UIcon name="i-lucide-plus" class="size-5" /><span class="flex-1 font-medium">Add a page</span><UIcon v-if="isPageLimitReached" name="i-lucide-lock" class="size-4" /></NuxtLink>
        </div>
      </div>

      <div v-if="publicSiteUrl" class="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-4 md:bottom-5">
        <UButton :to="publicSiteUrl" target="_blank" icon="i-lucide-external-link" label="View site" class="pointer-events-auto rounded-full px-5 shadow-lg" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { defaultModuleFeaturesForVertical, parseCmsFeatureOverrideDelta, resolveCmsCapabilities, templateCapabilityCatalog, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'My site | KrabiClaw', robots: 'noindex, nofollow' })

interface Location { id: string; slug: string; title: string; city: string | null; is_primary: boolean; hero_url: string | null; address: { addressLines?: string[] } | null }
interface HomeResponse { locations: Location[]; events: unknown[]; operations: { openThreads: number; unreadThreads: number; reservations: number; experienceBookings: number } }
interface Settings { brand_name: string | null; brand_description: string | null; brand_color: string; logo_url: string | null; theme: string; custom_domain_status: string; public_url: string | null }
interface PageSummary { id: string; title: string; path: string; status: string; recipe: string | null; blocks?: unknown[] }
interface MediaAsset { id: string; public_url: string; thumbnail_url: string | null }
interface LinkItem { id: string; label: string; destination: string; status: string }

const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
const route = useRoute()
const activeTab = ref<'site' | 'pages'>('site')
const tabs = [{ label: 'My site', value: 'site' as const }, { label: 'Pages', value: 'pages' as const }]
const siteDashboardPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}`)
const locationsPath = computed(() => `${siteDashboardPath.value}/locations`)
const siteName = computed(() => dashboard.site.value?.brand_name || 'My site')
const canManageSite = computed(() => dashboard.siteAccess.value !== 'location')
const template = computed(() => resolvePublicTemplate({ vertical: dashboard.site.value?.vertical }).slug)
const vertical = computed(() => normalizeVertical(dashboard.site.value?.vertical || 'restaurant') as SiteVertical)
const capabilities = computed(() => resolveCmsCapabilities(vertical.value, template.value, { site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides) }))

const { data: home, pending } = await useAsyncData(`site-index-home-${siteId}`, () => dashboardApi<HomeResponse>('/api/dashboard/home', {
  validate: (value): value is HomeResponse => isRecord(value) && Array.isArray(value.locations) && isRecord(value.operations),
}))
const { data: supporting, pending: supportingPending, error } = await useAsyncData(`site-index-support-${siteId}`, async () => {
  const [settingsResponse, pagesResponse, mediaResponse, linksResponse] = await Promise.all([
    dashboardApi<{ settings: Settings }>('/api/dashboard/settings', { validate: (value): value is { settings: Settings } => isRecord(value) && isRecord(value.settings) }),
    dashboardApi<{ pages: PageSummary[] }>(`/api/editor/sites/${siteId}/pages`, { validate: (value): value is { pages: PageSummary[] } => isRecord(value) && Array.isArray(value.pages) }),
    dashboardApi<{ media: MediaAsset[] }>(`/api/editor/sites/${siteId}/media?kind=image&limit=6&offset=0`, { validate: (value): value is { media: MediaAsset[] } => isRecord(value) && Array.isArray(value.media) }),
    dashboardApi<{ items: LinkItem[] }>(`/api/editor/sites/${siteId}/links-page`, { validate: (value): value is { items: LinkItem[] } => isRecord(value) && Array.isArray(value.items) }),
  ])
  return { settings: settingsResponse.settings, pages: pagesResponse.pages, media: mediaResponse.media, links: linksResponse.items }
}, { server: false })

const supportingError = computed(() => error.value ? (error.value instanceof Error ? error.value.message : 'Unable to load site details') : '')
const locations = computed(() => home.value?.locations ?? [])
const settings = computed(() => supporting.value?.settings)
const pages = computed(() => supporting.value?.pages ?? [])
const media = computed(() => supporting.value?.media ?? [])
const activeLinks = computed(() => (supporting.value?.links ?? []).filter(item => item.status === 'active'))
const homePage = computed(() => pages.value.find(page => page.path === '/'))
const publicationConsequence = computed(() => homePage.value?.status === 'published' ? 'Guests can see the current published version.' : 'Changes stay private until this page is published.')
const siteTourSummary = computed(() => `${locations.value.length} ${locations.value.length === 1 ? 'location' : 'locations'}${media.value.length ? ` · ${media.value.length}${media.value.length === 6 ? '+' : ''} photos` : ''}`)
const brandCover = computed(() => locations.value.find(item => item.is_primary)?.hero_url || media.value[0]?.public_url || '')
const siteDomain = computed(() => dashboard.site.value?.custom_domain || dashboard.site.value?.public_url || (dashboard.site.value?.subdomain ? `${dashboard.site.value.subdomain}.krabiclaw.com` : 'Domain not connected'))
const publicSiteUrl = computed(() => dashboard.site.value?.public_url || (dashboard.site.value?.subdomain ? `https://${dashboard.site.value.subdomain}.krabiclaw.com` : ''))
const siteType = computed(() => `${vertical.value.replaceAll('_', ' ')} · ${template.value} theme`)
const mediaSummary = computed(() => media.value.length ? `${media.value.length}${media.value.length === 6 ? '+' : ''} photos` : 'No media yet')
const heroContent = computed(() => JSON.stringify(homePage.value?.blocks ?? []))
function heroValue(key: 'title' | 'subtitle', fallback: string) { const match = heroContent.value.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`)); return match?.[1] || fallback }
const heroCards = computed(() => [
  { label: 'Title', value: heroValue('title', siteName.value), italic: false },
  { label: 'Description', value: heroValue('subtitle', settings.value?.brand_description || 'Add the opening description for your home page'), italic: true },
])

const pageIcons: Record<string, string> = { '/': 'i-lucide-house', '/about': 'i-lucide-info', '/contact': 'i-lucide-mail', '/menu': 'i-lucide-utensils', '/order': 'i-lucide-shopping-bag', '/reservations': 'i-lucide-calendar-check', '/experiences': 'i-lucide-ticket', '/services': 'i-lucide-briefcase', '/pricing': 'i-lucide-badge-dollar-sign', '/donate': 'i-lucide-heart-handshake', '/schedule': 'i-lucide-calendar-days', '/blog': 'i-lucide-newspaper' }
const featureByRoute: Record<string, ProductFeature> = { '/menu': 'menu', '/order': 'ordering', '/reservations': 'reservations', '/experiences': 'experiences', '/services': 'services', '/pricing': 'services', '/donate': 'services', '/schedule': 'services' }
const pageRows = computed(() => {
  const saved = new Map(pages.value.map(page => [page.path, page]))
  const catalog = templateCapabilityCatalog[template.value]
  const routes = [...catalog.pages.filter(page => page.scope === 'site'), { id: 'blog', label: 'Blog', route: '/blog', feature: 'blog' as ProductFeature }]
  return routes.map(page => {
    const existing = saved.get(page.route)
    const module = featureByRoute[page.route]
    const enabled = !module || capabilities.value.pages.some(item => item.scope === 'site' && item.route === page.route)
    return { id: page.id, label: page.label, icon: pageIcons[page.route] || 'i-lucide-file-text', module, status: enabled ? (existing?.status === 'published' || page.route === '/blog' ? 'live' : 'draft') : 'off', to: page.route === '/blog' ? `${siteDashboardPath.value}/blog` : `${siteDashboardPath.value}/pages` }
  })
})
const isPageLimitReached = computed(() => ['free', null].includes(dashboard.site.value?.plan ?? null))
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

function locationAddress(location: Location) { return location.address?.addressLines?.filter(Boolean).join(', ') || location.city || 'Address not set' }
function linkIcon(destination: string) { try { const host = new URL(destination).hostname.replace(/^www\./, ''); if (host.endsWith('facebook.com')) return 'i-simple-icons-facebook'; if (host.endsWith('instagram.com')) return 'i-simple-icons-instagram'; if (host.endsWith('tiktok.com')) return 'i-simple-icons-tiktok'; if (host.endsWith('youtube.com') || host === 'youtu.be') return 'i-simple-icons-youtube' } catch { return 'i-lucide-link' } return 'i-lucide-link' }
</script>
