<template>
  <!--
    Settings, Brand, Messages and Locations are their own screens with their own
    shells. A location in particular is a different object with its own editor,
    the way choosing a listing leaves the listings index for that listing.
  -->
  <NuxtPage v-if="rendersStandalone" />

  <!--
    Two columns, two panels. `UDashboardPanel` already carries the divider
    (`lg:not-last:border-e`), the scroll container and the body's padding.
    Below `lg` the open level is the whole screen and this one is not drawn.
  -->
  <template v-else>
    <UDashboardPanel
      id="site-hub"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
      <UDashboardNavbar :title="siteName || 'Site'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading />
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
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <div v-if="overviewPending" class="space-y-4">
            <USkeleton class="h-40 w-full rounded-2xl" />
            <USkeleton v-for="index in 5" :key="index" class="h-20 rounded-2xl" />
          </div>

          <UAlert
            v-else-if="overviewErrorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="This site could not be loaded"
            :description="overviewErrorMessage"
            :actions="[{ label: 'Try again', color: 'neutral', variant: 'subtle', onClick: () => refresh() }]"
          />

          <!--
            Two aspects of one site, the way the listing editor splits Your
            space from Arrival guide. Site: one card per thing a visitor meets,
            in the order they meet it, each stating what it holds. Locations:
            the places themselves. What a visitor never sees is behind the gear.
            The open tab lives in the URL, so Back from a location lands on it.
          -->
          <UTabs v-else v-model="tab" :items="tabs" class="w-full" :ui="{ list: 'mb-4' }">
            <template #site>
              <UPageList class="gap-3">
                <UPageCard
                  v-for="card in cards"
                  :key="card.id"
                  :to="card.to"
                  :title="card.title"
                  :description="card.description"
                  variant="soft"
                  :highlight="card.id === activeSection"
                  :ui="{ container: 'p-5 sm:p-5', title: 'text-[15px]', description: 'mt-1 line-clamp-2' }"
                >
                  <img
                    v-if="card.logo"
                    :src="card.logo"
                    alt=""
                    class="h-14 w-auto max-w-40 object-contain"
                  >
                </UPageCard>
              </UPageList>
            </template>

            <template #locations>
              <div class="space-y-4">
                <div class="flex justify-end">
                  <UButton
                    :to="`${sitePath}/locations/new`"
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="soft"
                    square
                    :aria-label="`Add a ${locationNoun}`"
                  />
                </div>
                <div v-if="!locations.length" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
                  <UIcon name="i-lucide-map-pin" class="mx-auto size-6 text-muted" />
                  <h2 class="mt-5 text-base font-semibold text-highlighted">No {{ locationsLabel.toLowerCase() }} yet</h2>
                  <UButton :label="`Add your first ${locationNoun}`" icon="i-lucide-plus" class="mt-6" :to="`${sitePath}/locations/new`" />
                </div>
                <DashboardSiteLocationSelector
                  v-else
                  :items="locationTiles"
                  missing-image-label="No hero photo"
                  missing-image-hint="Add one under this location's photos."
                />
              </div>
            </template>
          </UTabs>
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />

    <div v-if="publicSiteUrl && !hasDetail" class="pointer-events-none fixed inset-x-0 bottom-[calc(var(--kc-dashboard-bottom-nav)+1.25rem)] z-20 flex justify-center px-4 md:bottom-5">
      <UButton :to="publicSiteUrl" target="_blank" icon="i-lucide-external-link" label="View site" class="pointer-events-auto rounded-full px-5 shadow-lg" />
    </div>
  </template>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import DashboardSiteLocationSelector, { type SiteLocationSelectorItem } from '~/components/dashboard/SiteLocationSelector.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { hasPlatformAdminPermission } from '~/utils/platform-admin-access'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import type { DashboardHomeData } from '~/server/utils/dashboard-home'
import { tenantPageRows } from '~/composables/useTenantPageDraft'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const dashboardApi = useDashboardApi()
const dashboard = useDashboardSite()

// The frame comes first, and before any `await`. `useEditorFrame` provides and
// injects, which Vue only binds to this instance while setup is still
// synchronous; called after an await it binds to nothing and every level below
// this one loses its place in the chain.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const frame = useEditorFrame(sitePath)

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
const siteLogo = computed(() => dashboard.sites.value.find(site => site.id === siteId)?.media.find(item => item.slot === 'logo')?.public_url ?? '')
const publicSiteUrl = computed(() => dashboard.site.value?.public_url || '')

const session = authClient.useSession()
const currentUser = computed(() => session.value.data?.user ?? null)
const template = computed(() => resolvePublicTemplate({ themeId: dashboard.site.value?.theme_id, vertical: dashboard.site.value?.vertical }).slug)
const vertical = computed(() => {
  const raw = dashboard.site.value?.vertical
  if (!raw) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  return normalizeVertical(raw) as SiteVertical
})
const capabilities = computed(() => resolveCmsCapabilities(vertical.value, template.value, {
  site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
}))

const { data: overviewData, pending, error: overviewError, refresh } = await useAsyncData(`dashboard-home-${siteId}`, (_nuxtApp, { signal }) =>
  dashboardApi<DashboardHomeData>('/api/dashboard/home', {
    signal,
    validate: (value): value is DashboardHomeData => isRecord(value)
      && Array.isArray(value.pages)
      && isRecord(value.counts) && typeof value.counts.blog === 'number',
  }), {
  // While a child route owns the chrome — the page editor, the blog editor,
  // settings, a location — this hub's body is not rendered at all
  // (`rendersStandalone` above swaps the whole panel for <NuxtPage/>), so
  // nothing on screen reads this.
  immediate: !rendersStandalone.value,
})

// Landing directly on a child route and then navigating up to the hub: this
// component stays mounted, so the read skipped above has to happen now.
watch(rendersStandalone, (standalone) => {
  if (!standalone && !overviewData.value) refresh()
})

// Pending, or not started yet because the hub was reached from a child route.
// A failed read is neither: reporting it as pending left the skeletons up for
// good, with nothing on screen saying what had happened.
// In flight AND nothing to show. On `pending` alone a refetch replaced the
// loaded hub with a skeleton; without `pending` the skeleton outlived a
// finished request that returned nothing.
const overviewPending = computed(() =>
  !overviewError.value && pending.value && !overviewData.value)
const overviewErrorMessage = computed(() =>
  overviewError.value ? getErrorMessage(overviewError.value, 'Failed to load this site') : null)

const locations = computed(() => dashboard.locations.value)
const pagesCount = computed(() => tenantPageRows(overviewData.value?.pages ?? []).length)
const counts = computed(() => overviewData.value?.counts ?? { blog: 0, qa: 0, reviews: 0 })

/** Plural-aware count, or the empty state that says what to do instead. */
function countSummary(total: number, noun: string, empty: string): string {
  if (!total) return empty
  return `${total} ${total === 1 ? noun : `${noun}s`}`
}

/** "5 questions · 18 reviews", or what to do when there are none. */
function trustSummary(qa: number, reviews: number): string {
  const parts = [qa ? countSummary(qa, 'question', '') : '', reviews ? countSummary(reviews, 'review', '') : ''].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Answer your first question'
}

interface HubCard { id: string; title: string; description: string; to: string; logo?: string }

const usesServiceAreaVocabulary = computed(() => capabilities.value.locationVocabulary === 'office/service area')
const locationsLabel = computed(() => (usesServiceAreaVocabulary.value ? 'Offices / Service Areas' : 'Locations'))
const locationNoun = computed(() => (usesServiceAreaVocabulary.value ? 'office' : 'location'))

const tabs = computed(() => [
  { label: 'Site', slot: 'site' as const, value: 'site' },
  { label: locationsLabel.value, slot: 'locations' as const, value: 'locations' },
])
const router = useRouter()
const tab = computed({
  get: () => (route.query.tab === 'locations' ? 'locations' : 'site'),
  set: (value: string | number) => { void router.replace({ query: { ...route.query, tab: value === 'locations' ? 'locations' : undefined } }) },
})

/**
 * A location is identified by where it is, so the tile carries its address
 * and its own hero photograph. The generated social card has the name composed
 * into the pixels and cropped badly to the tile; the name belongs under it.
 */
const locationTiles = computed<SiteLocationSelectorItem[]>(() => locations.value.map(location => {
  const hero = location.media.find(item => item.slot === 'hero')
  const lines = location.address?.addressLines?.filter(line => line.trim()) ?? []
  return {
    id: location.id,
    label: location.title,
    imageUrl: hero ? (hero.kind === 'video' ? hero.thumbnail_url : hero.public_url) : null,
    eyebrow: '',
    summary: lines.length ? lines.join(', ') : 'Address not set',
    to: `${sitePath.value}/locations/${location.slug}`,
  }
}))

const managers = computed(() => new Set(capabilities.value.managers.filter(manager => manager.scope === 'site').map(manager => manager.id)))

/**
 * The site as a visitor meets it, ordered by how often a tenant edits it: the
 * pages, the blog, the reviews and questions, and last the brand, which is set
 * up once. Each card states its value. Brand is also the one card that owns
 * the whole screen, so it must not be the card the rail opens beside itself
 * at `lg`.
 */
const cards = computed<HubCard[]>(() => {
  const list: HubCard[] = [
    { id: 'pages', title: 'Pages', description: countSummary(pagesCount.value, 'page', 'No pages yet'), to: `${sitePath.value}/pages` },
  ]
  if (managers.value.has('blog')) list.push({ id: 'blog', title: 'Blog', description: countSummary(counts.value.blog, 'published post', 'Write your first post'), to: `${sitePath.value}/blog` })
  if (managers.value.has('qa')) list.push({ id: 'qa', title: 'Reviews and Q&A', description: trustSummary(counts.value.qa, counts.value.reviews), to: `${sitePath.value}/qa` })
  list.push({ id: 'brand', title: 'Brand', description: siteName.value, to: `${sitePath.value}/brand`, logo: siteLogo.value || undefined })
  // KrabiClaw's own site adds the one platform-only tool: acting as a customer.
  if (template.value === 'platform' && hasPlatformAdminPermission(currentUser.value?.role)) {
    list.push({ id: 'people', title: 'People', description: 'Every account; impersonate to see their dashboard', to: `${sitePath.value}/people` })
  }
  return list
})

// Tailwind's `lg`, which is where the second panel appears and where
// every other split in the dashboard sits. Kept as one constant per hub so the
// redirect and the layout cannot disagree about whether a pane exists.
const PANE_BREAKPOINT = '(min-width: 1024px)'
let sectionChosen = false

function openFirstSectionBesideTheRail() {
  if (sectionChosen || pending.value || hasDetail.value) return
  if (!window.matchMedia(PANE_BREAKPOINT).matches) return
  const first = cards.value[0]
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
