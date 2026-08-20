<template>
  <UDashboardPanel id="site-overview">
    <template #header>
      <UDashboardNavbar
        :title="siteName"
        :toggle="false"
        :ui="{ left: 'mx-auto w-full max-w-[var(--ws-page-narrow,45rem)]' }"
      >
        <template #leading><DashboardNavbarLeading /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-narrow,45rem)] pb-24">
        <div class="mb-3 flex items-center gap-2.5">
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

        <div v-if="!mounted || pending || supportingPending" class="space-y-4">
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

        <div v-else-if="activeTab === 'site'" class="space-y-3">
          <NuxtLink :to="`${siteDashboardPath}/pages`" class="site-card group flex items-center gap-3.5">
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 text-[15px] font-semibold text-highlighted">
                <UIcon :name="homePage?.status === 'published' ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'" class="size-[15px]" :class="homePage?.status === 'published' ? 'text-success' : 'text-warning'" />
                {{ homePage?.status === 'published' ? 'Live' : 'Draft' }}
              </p>
              <p class="mt-1 text-[13px] text-muted">{{ homePage?.status === 'published' ? 'Visible to guests.' : 'Not visible to guests. Publish to go live.' }}</p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition group-hover:translate-x-0.5" />
          </NuxtLink>

          <div class="site-card flex flex-col gap-3">
            <NuxtLink :to="locationsPath" class="group flex items-baseline justify-between gap-3">
              <div class="flex items-start justify-between gap-4">
                <p class="text-[15px] font-semibold text-highlighted">Site tour</p>
              </div>
              <p class="text-[13px] text-muted">{{ siteTourSummary }}</p>
            </NuxtLink>
            <div v-if="locations.length" class="site-tour">
              <NuxtLink
                v-for="(location, index) in tourLocations"
                :key="location.id"
                :to="`${locationsPath}/${location.slug}`"
                class="tour-location"
                :class="{ 'tour-location-primary': location.is_primary || (tourLocations.length < 3 && index === 0) }"
              >
                <img v-if="location.hero_url" :src="cfImageVariant(location.hero_url, { width: 480 }) ?? undefined" :alt="location.title" class="absolute inset-0 size-full object-cover" />
                <span class="tour-location-label">{{ location.title }}</span>
              </NuxtLink>
            </div>
            <NuxtLink v-else :to="locationsPath" class="flex h-40 items-center justify-center rounded-[14px] bg-muted text-sm text-muted">Add photos of your locations</NuxtLink>
            <NuxtLink v-if="openSiteTasks" :to="locationsPath" class="flex items-center gap-2 text-[13px] font-semibold text-warning"><UIcon name="i-lucide-circle-alert" class="size-3.5" />You have {{ openSiteTasks }} {{ openSiteTasks === 1 ? 'task' : 'tasks' }}</NuxtLink>
          </div>

          <NuxtLink :to="`${siteDashboardPath}/settings#brand`" class="site-card group flex flex-col gap-3">
              <div class="flex items-baseline justify-between gap-3"><p class="text-[15px] font-semibold text-highlighted">Brand</p><p class="truncate text-[13px] text-muted">{{ siteDomain }}</p></div>
              <div class="h-[132px] overflow-hidden rounded-xl border border-default bg-muted max-md:h-[120px] max-sm:h-[108px]"><img v-if="brandCover" :src="brandCover" alt="" class="size-full object-cover" /></div>
                <div class="flex items-start gap-5">
                    <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default" :style="!settings?.logo_url ? { backgroundColor: settings?.brand_color } : undefined">
                      <img v-if="settings?.logo_url" :src="settings.logo_url" :alt="`${siteName} logo`" class="size-full object-contain" />
                      <UIcon v-else name="i-lucide-upload" class="size-[22px] text-white/60" />
                    </div>
                    <div class="min-w-0 flex-1 space-y-2">
                      <p class="text-[13px] leading-5 text-muted">{{ settings?.brand_description || 'Add your brand description' }}</p>
                      <div class="flex items-center gap-2"><span class="size-6 rounded-lg border border-default" :style="{ backgroundColor: settings?.brand_color }" /><span class="text-xs text-muted">Brand color {{ settings?.brand_color }}</span></div>
                    </div>
                </div>
                <p v-if="settings?.custom_domain_status !== 'active'" class="mt-4 flex items-center gap-2 text-xs font-medium text-warning">
                  <UIcon name="i-lucide-circle-alert" class="size-4" /> Custom domain not connected
                </p>
          </NuxtLink>

          <div class="site-card flex flex-col gap-3">
            <div class="flex items-baseline justify-between gap-3"><p class="text-[15px] font-semibold text-highlighted">Social profiles</p><p class="text-[13px] text-muted">{{ socialAddedCount }} of {{ socialRows.length }} added</p></div>
            <div class="space-y-1">
              <EditorFieldRow v-for="row in socialRows" :key="row.key" :label="row.label" :filled="row.added" @click="openSocialField(row.key)" />
            </div>
          </div>

          <NuxtLink v-for="hero in heroCards" :key="hero.label" :to="`${siteDashboardPath}/pages`" class="site-card group block">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="text-[15px] font-semibold text-highlighted">{{ hero.label }}</p>
                  <p class="mt-3 text-[34px] leading-[1.05] tracking-[-0.02em] text-muted max-md:text-[30px] max-sm:text-[28px]" :class="hero.italic ? 'font-serif italic' : 'font-serif'">{{ hero.value }}</p>
                </div>
              </div>
          </NuxtLink>

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

      <SingleFieldEditor
        v-if="socialEditorField"
        v-model:open="socialEditorOpen"
        :label="socialEditorField.label"
        :value="settings?.[socialEditorField.key] ?? ''"
        kind="url"
        :placeholder="socialEditorField.placeholder"
        :save="saveSocialField"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { cfImageVariant } from '~/utils/cf-image'
import { defaultModuleFeaturesForVertical, parseCmsFeatureOverrideDelta, resolveCmsCapabilities, templateCapabilityCatalog, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'My site | KrabiClaw', robots: 'noindex, nofollow' })

interface Location { id: string; slug: string; title: string; city: string | null; is_primary: boolean; hero_url: string | null; address: { addressLines?: string[] } | null }
interface HomeResponse { locations: Location[]; events: unknown[]; operations: { openThreads: number; unreadThreads: number; reservations: number; experienceBookings: number } }
interface Settings { brand_name: string | null; brand_description: string | null; brand_color: string; logo_url: string | null; theme: string; custom_domain_status: string; public_url: string | null; social_facebook_url: string | null; social_instagram_url: string | null; social_tiktok_url: string | null }
interface PageSummary { id: string; title: string; path: string; status: string; recipe: string | null; blocks?: unknown[] }
interface MediaAsset { id: string; public_url: string; thumbnail_url: string | null }
interface LinkItem { id: string; label: string; destination: string; status: string }

const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const requestEvent = useRequestEvent()
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
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

const { data: home, pending } = await useAsyncData(`site-index-home-${siteId}`, async (_nuxtApp, { signal }) => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const organization = dashboard.organization.value
    if (!organization) throw createError({ statusCode: 403, statusMessage: 'Dashboard organization unavailable' })
    const [{ cloudflareEnv }, { getDashboardHomeData }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/dashboard-home'),
    ])
    const db = cloudflareEnv(requestEvent).db
    if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
    return await getDashboardHomeData(db, organization.id, siteId, {
      memberId: organization.memberId,
      role: organization.role,
    })
  }
  return await dashboardApi<HomeResponse>('/api/dashboard/home', {
    signal,
    validate: (value): value is HomeResponse => isRecord(value) && Array.isArray(value.locations) && isRecord(value.operations),
  })
})
const { data: supporting, pending: supportingPending, error, refresh: refreshSupporting } = await useAsyncData(`site-index-support-${siteId}`, async () => {
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
const siteTourSummary = computed(() => `${locations.value.length} ${locations.value.length === 1 ? 'location' : 'locations'}${media.value.length ? ` · ${media.value.length}${media.value.length === 6 ? '+' : ''} photos` : ''}`)
const tourLocations = computed(() => {
  const primary = locations.value.find(location => location.is_primary)
  const others = locations.value.filter(location => location.id !== primary?.id)
  return primary ? [others[0], primary, others[1]].filter((location): location is Location => Boolean(location)) : locations.value.slice(0, 3)
})
const openSiteTasks = computed(() => settings.value?.custom_domain_status === 'active' ? 0 : 1)
const SOCIAL_FIELDS = [
  { key: 'social_facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/...' },
  { key: 'social_instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'social_tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
] as const
const socialRows = computed(() => SOCIAL_FIELDS.map(field => ({
  key: field.key,
  label: field.label,
  added: Boolean(settings.value?.[field.key]),
})))
const socialAddedCount = computed(() => socialRows.value.filter(row => row.added).length)
const socialEditingKey = ref<typeof SOCIAL_FIELDS[number]['key'] | null>(null)
const socialEditorOpen = computed({
  get: () => socialEditingKey.value !== null,
  set: (isOpen: boolean) => { if (!isOpen) socialEditingKey.value = null },
})
const socialEditorField = computed(() => SOCIAL_FIELDS.find(field => field.key === socialEditingKey.value))
function openSocialField(key: typeof SOCIAL_FIELDS[number]['key']) {
  socialEditingKey.value = key
}
async function saveSocialField(value: string) {
  const key = socialEditingKey.value
  if (!key) return
  await dashboardApi('/api/dashboard/settings', {
    method: 'PATCH',
    body: { [key]: value || null },
    validate: (v): v is { success: boolean } => isRecord(v) && typeof v.success === 'boolean',
  })
  await refreshSupporting()
}
const brandCover = computed(() => locations.value.find(item => item.is_primary)?.hero_url || media.value[0]?.public_url || '')
const siteDomain = computed(() => dashboard.site.value?.custom_domain || dashboard.site.value?.public_url || '')
const publicSiteUrl = computed(() => dashboard.site.value?.public_url || '')
const siteType = computed(() => `${vertical.value.replaceAll('_', ' ')} · ${template.value} theme`)
const mediaSummary = computed(() => media.value.length ? `${media.value.length}${media.value.length === 6 ? '+' : ''} photos` : 'No media yet')
const heroContent = computed(() => JSON.stringify(homePage.value?.blocks ?? []))
function heroValue(key: 'title' | 'subtitle') { const match = heroContent.value.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`)); return match?.[1] || '' }
const heroCards = computed(() => [
  { label: 'Title', value: heroValue('title'), italic: false },
  { label: 'Description', value: heroValue('subtitle'), italic: true },
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

function linkIcon(destination: string) { try { const host = new URL(destination).hostname.replace(/^www\./, ''); if (host.endsWith('facebook.com')) return 'i-simple-icons-facebook'; if (host.endsWith('instagram.com')) return 'i-simple-icons-instagram'; if (host.endsWith('tiktok.com')) return 'i-simple-icons-tiktok'; if (host.endsWith('youtube.com') || host === 'youtu.be') return 'i-simple-icons-youtube' } catch { return 'i-lucide-link' } return 'i-lucide-link' }
</script>

<style scoped>
.site-card { padding: 20px; border: 1px solid var(--ui-border); border-radius: 16px; background: var(--ui-bg-elevated); color: var(--ui-text); transition: border-color 150ms ease; }
.site-card:hover { border-color: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border)); }
.site-tour { display: flex; height: 162px; align-items: center; justify-content: center; padding-block: 6px; }
.tour-location { position: relative; width: 27%; height: 68%; overflow: hidden; border: 1px solid var(--ui-border-muted); border-radius: 14px; background: var(--ui-bg-muted); }
.tour-location:first-child { margin-right: -22px; transform: rotate(-6deg); }
.tour-location:last-child { margin-left: -22px; transform: rotate(6deg); }
.tour-location-primary { z-index: 1; width: 50%; height: 100%; margin-inline: 0 !important; transform: none !important; box-shadow: 0 10px 26px rgb(4 6 20 / 45%); }
.tour-location-label { position: absolute; right: 8px; bottom: 8px; left: 8px; overflow: hidden; color: var(--ui-text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.tour-location-primary .tour-location-label { top: 12px; right: auto; bottom: auto; left: 50%; max-width: calc(100% - 24px); transform: translateX(-50%); border-radius: 999px; background: var(--ui-bg-elevated); padding: 6px 12px; color: var(--ui-text-highlighted); font-size: 12.5px; font-weight: 600; box-shadow: 0 2px 8px rgb(4 6 20 / 45%); }
@media (max-width: 767px) { .site-card { padding: 18px; } .site-tour { height: 150px; } }
@media (max-width: 639px) { .site-card { padding: 16px; } .site-tour { height: 140px; } }
</style>
