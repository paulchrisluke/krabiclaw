<template>
  <UDashboardPanel id="site-overview">
    <template #header>
      <UDashboardNavbar :title="siteName" :toggle="false">
        <template #leading><DashboardNavbarLeading /></template>
        <template v-if="siteSettingsPath" #right>
          <UButton
            :to="siteSettingsPath"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            class="min-h-11 min-w-11"
            square
            aria-label="Site settings"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-narrow,45rem)] pb-8">
        <UTabs
          v-model="activeTab"
          :items="tabs"
          :content="false"
          variant="pill"
          class="mb-8 w-full"
          :ui="{ list: 'w-full', trigger: 'flex-1 min-h-11' }"
        />

        <div v-if="pending" class="space-y-4">
          <USkeleton v-for="index in 5" :key="index" class="h-32 rounded-2xl" />
        </div>

        <UAlert
          v-else-if="overviewError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="overviewError.message"
        />

        <div v-else-if="activeTab === 'overview'" class="space-y-10">
          <section v-if="locationsManagerPath" class="space-y-4">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-base font-semibold text-highlighted">{{ locationsManagerLabel }}</h2>
              </div>
              <UButton
                v-if="canManageSite"
                :to="`${locationsManagerPath}/new`"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                label="Add"
              />
            </div>

            <div v-if="locations.length" class="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <NuxtLink
                v-for="location in locations"
                :key="location.id"
                :to="`${locationsManagerPath}/${encodeURIComponent(location.slug)}`"
                class="group min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-default"
              >
                <div class="aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
                  <img
                    v-if="locationMediaUrl(location)"
                    :src="locationMediaUrl(location) ?? undefined"
                    :alt="`${location.title} preview`"
                    class="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                  />
                  <div v-else class="flex size-full items-center justify-center text-dimmed">
                    <UIcon name="i-lucide-image-off" class="size-7" />
                  </div>
                </div>
                <div class="flex items-center justify-between gap-3 px-1 pt-3">
                  <p class="truncate font-semibold text-highlighted">{{ location.title }}</p>
                  <UBadge v-if="location.is_primary" color="neutral" variant="soft">Primary</UBadge>
                </div>
              </NuxtLink>
            </div>

            <UButton
              v-else-if="canManageSite"
              :to="`${locationsManagerPath}/new`"
              icon="i-lucide-plus"
              label="Add a location"
              color="neutral"
              variant="soft"
            />
          </section>

          <section v-if="siteSettingsPath" class="border-y border-default py-6">
            <NuxtLink
              :to="siteSettingsPath"
              class="group grid min-h-20 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-xl px-2 outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div
                class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default"
                :style="!logoUrl ? { backgroundColor: settings?.brand_color } : undefined"
              >
                <img v-if="logoUrl" :src="logoUrl" :alt="`${siteName} logo`" class="size-full object-contain" />
                <span v-else class="text-xl font-semibold text-white">{{ siteName.slice(0, 1) }}</span>
              </div>
              <div class="min-w-0">
                <h2 class="font-semibold text-highlighted">Brand</h2>
                <p class="mt-1 line-clamp-2 text-sm text-muted">{{ settings?.brand_description || 'Add your brand description' }}</p>
                <p class="mt-2 truncate text-xs text-dimmed">{{ siteDomain || siteType }}</p>
              </div>
            </NuxtLink>
          </section>
        </div>

        <div v-else class="space-y-10">
          <section class="space-y-3">
            <div class="px-1">
              <h2 class="text-base font-semibold text-highlighted">Pages</h2>
            </div>
            <div class="divide-y divide-default border-y border-default">
              <NuxtLink
                v-for="page in tenantPageRows"
                :key="page.id"
                :to="page.to"
                class="flex min-h-16 items-center justify-between gap-4 px-1 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              >
                <span class="min-w-0">
                  <span class="block truncate font-medium text-highlighted">{{ page.label }}</span>
                  <span class="mt-1 block truncate text-sm text-muted">{{ page.path }}</span>
                </span>
                <span class="text-sm font-medium text-muted">Edit</span>
              </NuxtLink>
              <NuxtLink
                :to="`${siteDashboardPath}/pages/new`"
                class="flex min-h-14 items-center gap-2 px-1 text-sm font-medium text-muted outline-none hover:text-highlighted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              >
                <UIcon name="i-lucide-plus" class="size-4" />
                Add a page
              </NuxtLink>
            </div>
          </section>

          <section
            v-if="siteManagerItems.length"
            aria-label="Website managers"
            class="divide-y divide-default border-y border-default"
          >
            <NuxtLink
              v-for="item in siteManagerItems"
              :key="item.manager.key"
              :to="item.to"
              :data-testid="`manager-preview-${item.manager.id}`"
              class="group block px-1 py-6 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            >
              <template v-if="item.manager.id === 'media'">
                <div class="flex items-baseline justify-between gap-4">
                  <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                  <span class="text-sm text-muted">{{ media.length ? `${media.length}${media.length === 6 ? '+' : ''} files` : 'No files yet' }}</span>
                </div>
                <div v-if="mediaPreviewUrls.length" class="mt-4 grid grid-cols-4 gap-2">
                  <img
                    v-for="(url, index) in mediaPreviewUrls"
                    :key="url"
                    :src="url"
                    alt=""
                    class="aspect-square size-full rounded-xl object-cover"
                    :class="index === 0 ? 'col-span-2 row-span-2' : ''"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <p v-else class="mt-3 text-sm text-muted">Add the first image or file.</p>
              </template>

              <template v-else-if="item.manager.id === 'links'">
                <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                  <div>
                    <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                    <p class="mt-1 text-sm text-muted">{{ activeLinks.length ? `${activeLinks.length} active` : 'No active links' }}</p>
                  </div>
                  <div v-if="activeLinks.length" class="space-y-2">
                    <div v-for="link in activeLinks.slice(0, 3)" :key="link.id" class="min-w-0">
                      <p class="truncate text-sm font-medium text-highlighted">{{ link.label }}</p>
                      <p class="truncate text-xs text-dimmed">{{ link.destination }}</p>
                    </div>
                  </div>
                </div>
              </template>

              <template v-else-if="item.manager.id === 'blog'">
                <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                  <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                  <div v-if="overview.managerPreviews.blog.length" class="space-y-2">
                    <p v-for="post in overview.managerPreviews.blog" :key="post.id" class="truncate text-sm font-medium text-highlighted">
                      {{ post.title }} <span class="font-normal capitalize text-dimmed">{{ post.status }}</span>
                    </p>
                  </div>
                  <p v-else class="text-sm text-muted">No posts yet</p>
                </div>
              </template>

              <template v-else-if="item.manager.id === 'testimonials'">
                <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                  <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                  <div v-if="overview.managerPreviews.testimonials.length" class="space-y-3">
                    <blockquote v-for="testimonial in overview.managerPreviews.testimonials" :key="testimonial.id">
                      <p class="line-clamp-2 text-sm leading-6 text-highlighted">“{{ testimonial.content }}”</p>
                      <footer class="mt-1 text-xs text-dimmed">{{ testimonial.author_name }} · {{ testimonial.rating }}/5</footer>
                    </blockquote>
                  </div>
                  <p v-else class="text-sm text-muted">No testimonials yet</p>
                </div>
              </template>

              <template v-else-if="item.manager.id === 'qa'">
                <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                  <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                  <dl v-if="overview.managerPreviews.qa.length" class="space-y-3">
                    <div v-for="entry in overview.managerPreviews.qa" :key="entry.id">
                      <dt class="text-sm font-medium text-highlighted">{{ entry.question }}</dt>
                      <dd v-if="entry.answer" class="mt-1 line-clamp-1 text-sm text-muted">{{ entry.answer }}</dd>
                    </div>
                  </dl>
                  <p v-else class="text-sm text-muted">No questions yet</p>
                </div>
              </template>

              <template v-else-if="item.manager.id === 'ordering'">
                <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                  <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                  <div v-if="orderingLocations.length" class="space-y-2">
                    <div v-for="location in orderingLocations" :key="location.id" class="flex items-baseline justify-between gap-4">
                      <p class="truncate text-sm font-medium text-highlighted">{{ location.title }}</p>
                      <p class="shrink-0 text-xs text-dimmed">{{ location.providers.join(' · ') }}</p>
                    </div>
                  </div>
                  <p v-else class="text-sm text-muted">No ordering links yet</p>
                </div>
              </template>

              <template v-else-if="item.manager.id === 'services'">
                <div class="grid gap-4 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)]">
                  <h2 class="text-base font-semibold text-highlighted">{{ item.manager.label }}</h2>
                  <div v-if="overview.managerPreviews.services.length" class="space-y-2">
                    <div v-for="service in overview.managerPreviews.services" :key="service.id">
                      <p class="text-sm font-medium text-highlighted">{{ service.name }}</p>
                      <p v-if="service.summary" class="mt-1 line-clamp-1 text-xs text-dimmed">{{ service.summary }}</p>
                    </div>
                  </div>
                  <p v-else class="text-sm text-muted">No services yet</p>
                </div>
              </template>

              <template v-else>
                <h2 class="py-2 text-xl font-semibold text-highlighted">{{ item.manager.label }}</h2>
              </template>
            </NuxtLink>
          </section>
        </div>
      </div>

      <div v-if="publicSiteUrl" class="dashboard-site-preview-action pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4">
        <UButton
          :to="publicSiteUrl"
          target="_blank"
          icon="i-lucide-external-link"
          label="View site"
          class="pointer-events-auto rounded-full px-5 shadow-lg"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import type { DashboardHomeData } from '~/server/utils/dashboard-home'
import { resolveDashboardManagerRoute, type DashboardManagerRouteContext } from '~/utils/dashboard-navigation'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'My site | KrabiClaw', robots: 'noindex, nofollow' })

const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const requestEvent = useRequestEvent()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Site not found' })

const route = useRoute()
const activeTab = ref<'overview' | 'website'>('overview')
const tabs = [
  { label: 'Overview', value: 'overview' as const },
  { label: 'Website', value: 'website' as const },
]
const organizationSlug = computed(() => String(route.params.orgSlug))
const siteSlug = computed(() => String(route.params.siteSlug))
const siteDashboardPath = computed(() => `/dashboard/${encodeURIComponent(organizationSlug.value)}/sites/${encodeURIComponent(siteSlug.value)}`)
const managerContext = computed<DashboardManagerRouteContext>(() => ({
  scope: 'site',
  organizationSlug: organizationSlug.value,
  siteSlug: siteSlug.value,
}))
const siteName = computed(() => dashboard.site.value?.brand_name ?? '')
const canManageSite = computed(() => dashboard.siteAccess.value !== 'location')
const template = computed(() => resolvePublicTemplate({ vertical: dashboard.site.value?.vertical }).slug)
const vertical = computed(() => {
  const raw = dashboard.site.value?.vertical
  if (!raw) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  return normalizeVertical(raw) as SiteVertical
})
const capabilities = computed(() => resolveCmsCapabilities(vertical.value, template.value, {
  site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
}))
const siteManagers = computed(() => capabilities.value.managers.filter(manager => manager.scope === 'site'))
const locationsManager = computed(() => siteManagers.value.find(manager => manager.id === 'locations') ?? null)
const settingsManager = computed(() => siteManagers.value.find(manager => manager.id === 'settings') ?? null)
const locationsManagerPath = computed(() => locationsManager.value
  ? resolveDashboardManagerRoute({ manager: locationsManager.value, context: managerContext.value })
  : null)
const locationsManagerLabel = computed(() => locationsManager.value?.label ?? 'Locations')
const siteSettingsPath = computed(() => settingsManager.value
  ? resolveDashboardManagerRoute({ manager: settingsManager.value, context: managerContext.value })
  : null)

const locationMediaUrl = (location: DashboardHomeData['locations'][number]) => {
  const media = location.media.find(item => item.slot === 'hero')
  if (media?.kind === 'video') return media.thumbnail_url || null
  return media?.public_url || null
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string'
const isManagerPreviews = (value: unknown): value is DashboardHomeData['managerPreviews'] =>
  isRecord(value)
  && Array.isArray(value.blog)
  && value.blog.every(item => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.title === 'string'
    && typeof item.status === 'string')
  && Array.isArray(value.testimonials)
  && value.testimonials.every(item => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.author_name === 'string'
    && typeof item.content === 'string'
    && typeof item.rating === 'number')
  && Array.isArray(value.qa)
  && value.qa.every(item => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.question === 'string'
    && isNullableString(item.answer))
  && Array.isArray(value.services)
  && value.services.every(item => isRecord(item)
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && isNullableString(item.summary))

const { data: overviewData, pending, error: overviewError } = await useAsyncData(`dashboard-home-${siteId}`, async (_nuxtApp, { signal }) => {
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
      && Array.isArray(value.links)
      && isManagerPreviews(value.managerPreviews),
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
const mediaPreviewUrls = computed(() => media.value.slice(0, 4).map(item => item.thumbnail_url || item.public_url))
const orderingLocations = computed(() => locations.value.flatMap((location) => {
  const providers = [
    location.grab_url ? 'Grab' : null,
    location.uber_eats_url ? 'Uber Eats' : null,
    location.foodpanda_url ? 'Foodpanda' : null,
  ].filter((provider): provider is string => Boolean(provider))
  return providers.length ? [{ id: location.id, title: location.title, providers }] : []
}))
const siteDomain = computed(() => dashboard.site.value?.custom_domain || dashboard.site.value?.public_url || '')
const publicSiteUrl = computed(() => dashboard.site.value?.public_url || '')
const siteType = computed(() => `${vertical.value.replaceAll('_', ' ')}, ${template.value} theme`)

const tenantPageRows = computed(() => pages.value.map((page) => {
  const definition = capabilities.value.pages.find(candidate => candidate.scope === 'site' && candidate.route === page.path)
  return {
    id: page.id,
    label: definition?.label ?? page.title,
    path: page.path,
    to: `${siteDashboardPath.value}/pages/${encodeURIComponent(page.id)}`,
  }
}))

const siteManagerItems = computed(() => siteManagers.value
    .filter(manager => manager.id !== 'locations' && manager.id !== 'settings')
    .flatMap((manager) => {
      const to = resolveDashboardManagerRoute({ manager, context: managerContext.value })
      return to ? [{ manager, to }] : []
    }))
</script>
