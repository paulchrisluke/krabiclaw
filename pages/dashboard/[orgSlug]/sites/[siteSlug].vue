<template>
  <!--
    Settings, Brand, Inbox and Locations are their own screens with their own
    shells. A location in particular is a different object with its own editor,
    the way choosing a listing leaves the listings index for that listing.
  -->
  <NuxtPage v-if="rendersStandalone" />

  <UDashboardPanel v-else id="site-hub">
    <template #header>
      <UDashboardNavbar :title="siteName || 'Site'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="`${orgPaths.org}/sites`" label="Sites" />
        </template>
        <template #right>
          <UButton
            v-if="canManageSite"
            :to="`${sitePath}/settings`"
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            square
            aria-label="Site settings"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="hasDetail"
        :detail-title="detailTitle"
        :dismiss-to="sitePath"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <div v-if="pending" class="space-y-4">
            <USkeleton class="h-40 w-full rounded-2xl" />
            <USkeleton v-for="index in 5" :key="index" class="h-20 rounded-2xl" />
          </div>

          <div v-else class="space-y-6">
            <!--
              A problem with the site comes first and only when there is one,
              the way the listing editor leads with "Unlisted" rather than with
              the listing's own details. Otherwise the rail opens on Locations,
              which is what a tenant came here to open.
            -->
            <NuxtLink
              v-if="settings && settings.custom_domain_status !== 'active'"
              :to="`${sitePath}/settings/domains`"
              class="block rounded-2xl bg-elevated p-5 transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span class="flex items-center gap-2 text-[15px] font-semibold text-warning">
                <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" /> Custom domain not connected
              </span>
              <span class="mt-1 block text-sm text-muted">
                {{ siteDomain ?? 'No custom domain set' }}
              </span>
            </NuxtLink>

            <EditorNavigationList :groups="sectionGroups" :active-item="activeSection" variant="cards" />
          </div>
        </template>

        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>

      <div v-if="publicSiteUrl && !hasDetail" class="pointer-events-none fixed inset-x-0 bottom-[calc(var(--kc-dashboard-bottom-nav)+1.25rem)] z-20 flex justify-center px-4 md:bottom-5">
        <UButton :to="publicSiteUrl" target="_blank" icon="i-lucide-external-link" label="View site" class="pointer-events-auto rounded-full px-5 shadow-lg" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import type { DashboardHomeData } from '~/server/utils/dashboard-home'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()
const requestEvent = useRequestEvent()
const { orgPaths } = useDashboardSiteLinks()

// The frame comes first, and before any `await`. `useEditorFrame` provides and
// injects, which Vue only binds to this instance while setup is still
// synchronous; called after an await it binds to nothing and every level below
// this one loses its place in the chain.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const frame = useEditorFrame(sitePath)

if (!dashboard.state.value) await dashboard.refresh()
const siteId = dashboard.siteId.value
if (!siteId) throw createError({ statusCode: 404, statusMessage: 'Site not found' })

/**
 * The site yields when the screen below it draws its own panel and navbar. The
 * child declares that with `ownsChrome` in its own `definePageMeta`, rather
 * than the site keeping a list of which sections are special — a list is an
 * exception mechanism, and nothing here needs editing when a section gains a
 * chain of its own.
 */
const rendersStandalone = computed(() => route.matched.some(record => record.meta?.ownsChrome === true))
const hasDetail = computed(() => frame.mode.value !== 'index')
const activeSection = frame.childSegment

const siteName = computed(() => dashboard.site.value?.brand_name ?? '')
const canManageSite = computed(() => dashboard.siteAccess.value !== 'location')
// The custom domain and only the custom domain. Falling through to the public
// URL printed a working krabiclaw.com address underneath "Custom domain not
// connected", which reads as the domain that failed.
const siteDomain = computed(() => dashboard.site.value?.custom_domain ?? null)
const publicSiteUrl = computed(() => dashboard.site.value?.public_url || '')

const { user: currentUser } = await useAuthSession()
const template = computed(() => resolvePublicTemplate({ themeId: dashboard.site.value?.theme_id, vertical: dashboard.site.value?.vertical }).slug)
const vertical = computed(() => {
  const raw = dashboard.site.value?.vertical
  if (!raw) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  return normalizeVertical(raw) as SiteVertical
})
const capabilities = computed(() => resolveCmsCapabilities(vertical.value, template.value, {
  site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
}))

const { data: overviewData, pending } = await useAsyncData(`dashboard-home-${siteId}`, async (_nuxtApp, { signal }) => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
    const organization = dashboard.organization.value
    if (!organization) throw createError({ statusCode: 403, statusMessage: 'Dashboard organization unavailable' })
    const [{ cloudflareEnv }, { getDashboardHomeData }, { assertSiteWideAccess }, { getAuthSession }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/dashboard-home'),
      import('~/server/utils/member-access'),
      import('~/server/utils/auth'),
    ])
    const environment = cloudflareEnv(requestEvent)
    const db = environment.db
    if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
    const session = await getAuthSession(requestEvent, environment)
    if (!session?.user?.id) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
    await assertSiteWideAccess(db, { env: environment, memberId: organization.memberId, role: organization.role, organizationId: organization.id, siteId })
    return await getDashboardHomeData(db, organization.id, siteId, { env: environment, memberId: organization.memberId, userId: session.user.id, role: organization.role })
  }
  return await dashboardApi<DashboardHomeData>('/api/dashboard/home', {
    signal,
    validate: (value): value is DashboardHomeData => isRecord(value)
      && Array.isArray(value.locations) && isRecord(value.settings)
      && Array.isArray(value.pages) && Array.isArray(value.media) && Array.isArray(value.links),
  })
})

const settings = computed(() => overviewData.value?.settings ?? null)
const locations = computed(() => overviewData.value?.locations ?? [])
const pagesCount = computed(() => overviewData.value?.pages.length ?? 0)
const mediaCount = computed(() => overviewData.value?.media.length ?? 0)
const activeLinksCount = computed(() => overviewData.value?.links.filter(item => item.status === 'active').length ?? 0)

/** Plural-aware count, or the empty state that says what to do instead. */
function countSummary(total: number, noun: string, empty: string): string {
  if (!total) return empty
  return `${total} ${total === 1 ? noun : `${noun}s`}`
}

/**
 * The site's own sections. Locations comes first because a tenant works inside
 * one; the rest are site-wide content. Collections come from the registry, so a
 * manager declared there cannot be left unreachable.
 */
const sectionGroups = computed(() => {
  // Opening a location is the thing a tenant does most, so it leads the rail
  // and shows the locations themselves rather than only counting them.
  const place = [{
    id: 'locations',
    label: 'Locations',
    summary: countSummary(locations.value.length, 'location', 'Add your first location'),
    to: `${sitePath.value}/locations`,
    previews: locations.value
      .map(location => location.media.find(item => item.slot === 'social_card')?.public_url)
      .filter((url): url is string => Boolean(url)),
  }]

  // Ordered by how often a tenant edits it, not by the order the registry
  // happens to declare things in. Guest-facing content first, then the
  // long-form and peripheral surfaces.
  const known: Record<string, { label: string; summary: string; rank: number }> = {
    qa: { label: 'Q&A', summary: '', rank: 1 },
    testimonials: { label: 'Testimonials', summary: '', rank: 2 },
    ordering: { label: 'Orders', summary: '', rank: 3 },
    blog: { label: 'Blog posts', summary: '', rank: 4 },
    media: { label: 'Media library', summary: countSummary(mediaCount.value, 'file', 'Upload your first file'), rank: 5 },
    links: { label: 'Links page', summary: countSummary(activeLinksCount.value, 'active link', 'Add your first link'), rank: 6 },
  }

  // Brand is its own surface, not the cog's: the gear opens site settings,
  // this opens the brand editor. It ranks last because it is set up once.
  const content = [
    { id: 'pages', label: 'Pages', summary: countSummary(pagesCount.value, 'page', 'No pages yet'), to: `${sitePath.value}/pages` },
    ...capabilities.value.managers
      .filter(manager => manager.scope === 'site' && manager.route && known[manager.id])
      .map(manager => ({
        id: manager.route.split('/')[0]!,
        label: known[manager.id]!.label,
        summary: known[manager.id]!.summary,
        to: `${sitePath.value}/${manager.route}`,
        rank: known[manager.id]!.rank,
      }))
      .sort((a, b) => a.rank - b.rank),
    { id: 'brand', label: 'Brand', summary: siteName.value, to: `${sitePath.value}/brand` },
  ]

  // KrabiClaw's own site adds the one platform-only tool: acting as a customer.
  const platform = template.value === 'platform' && hasPlatformAdminPermission(currentUser.value?.role)
    ? [{ id: 'people', label: 'People', summary: 'Every account; impersonate to see their dashboard', to: `${sitePath.value}/people` }]
    : []

  return [
    { id: 'place', items: place },
    { id: 'content', label: 'Content', items: content },
    { id: 'platform', label: 'KrabiClaw', items: platform },
  ].filter(group => group.items.length > 0)
})

const detailTitle = computed(() => {
  for (const group of sectionGroups.value) {
    const match = group.items.find(item => item.id === activeSection.value)
    if (match) return match.label
  }
  return ''
})

// Tailwind's `lg`, which is where EditorPaneShell puts the pane and where
// every other split in the dashboard sits. Kept as one constant per hub so the
// redirect and the layout cannot disagree about whether a pane exists.
const PANE_BREAKPOINT = '(min-width: 1024px)'
let sectionChosen = false

function openFirstSectionBesideTheRail() {
  if (sectionChosen || pending.value || hasDetail.value) return
  if (!window.matchMedia(PANE_BREAKPOINT).matches) return
  const first = sectionGroups.value[0]?.items[0]
  if (!first) return
  sectionChosen = true
  void navigateTo(first.to, { replace: true })
}

onMounted(() => {
  openFirstSectionBesideTheRail()
  watch([pending, hasDetail], openFirstSectionBesideTheRail)
})

useSeoMeta({ title: () => `${siteName.value || 'Site'} | KrabiClaw`, robots: 'noindex, nofollow' })
</script>
