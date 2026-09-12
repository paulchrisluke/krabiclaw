<template>
  <UDashboardPanel id="organization-insights">
    <template #header>
      <UDashboardNavbar title="Insights">
        <template #leading>
          <DashboardNavbarLeading :to="orgPaths.org" label="Today" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UAlert
          v-if="loadError"
          color="error"
          variant="soft"
          title="Analytics could not be loaded"
          :description="loadError"
        />
        <!--
          Which sites the figures cover. Every site the member may read is
          listed, so the filter can never offer one the API would refuse.
        -->
        <div v-if="sites.length > 1" class="flex flex-wrap gap-2">
          <UButton
            label="All sites"
            size="sm"
            :variant="selectedSiteId === null ? 'soft' : 'ghost'"
            :color="selectedSiteId === null ? 'primary' : 'neutral'"
            @click="selectSite(null)"
          />
          <UButton
            v-for="site in sites"
            :key="site.id"
            :label="site.label"
            size="sm"
            :variant="selectedSiteId === site.id ? 'soft' : 'ghost'"
            :color="selectedSiteId === site.id ? 'primary' : 'neutral'"
            @click="selectSite(site.id)"
          />
        </div>


        <UTabs
          v-model="tab"
          :items="tabItems"
          :content="false"
          class="w-full"
        />

        <div v-if="tab === 'views'" class="space-y-6">
          <UCard variant="soft">
            <div class="grid gap-4 lg:grid-cols-[13rem_1fr]">
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <UButton
                  v-for="preset in presets"
                  :key="preset.key"
                  :label="preset.label"
                  :variant="activePreset === preset.key ? 'soft' : 'ghost'"
                  :color="activePreset === preset.key ? 'primary' : 'neutral'"
                  :disabled="loading || !analytics || !!loadError"
                  block
                  class="justify-start"
                  @click="applyPreset(preset.key)"
                />
              </div>
              <div class="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <UFormField label="Start date">
                  <UInput v-model="range.startDate" type="date" class="w-full" @change="markCustomAndLoad" />
                </UFormField>
                <UFormField label="End date">
                  <UInput v-model="range.endDate" type="date" class="w-full" @change="markCustomAndLoad" />
                </UFormField>
                <UButton icon="i-lucide-check" :loading="loading" @click="markCustomAndLoad">
                  Apply
                </UButton>
              </div>
            </div>
          </UCard>

          <div class="grid gap-4 xl:grid-cols-2">
            <UCard variant="soft">
              <template #header><h2 class="font-semibold text-highlighted">Attribution</h2></template>
              <div class="space-y-3">
                <DashboardAnalyticsRow
                  v-for="row in analytics?.attribution || []"
                  :key="`${row.source}-${row.medium}-${row.campaign || ''}`"
                  :label="`${row.source} / ${row.medium}${row.campaign ? ` · ${row.campaign}` : ''}`"
                  :value="`${formatCount(row.sessions)} sessions · ${formatCount(row.conversions)} conversions`"
                  :percent="row.conversionRate"
                />
                <p v-if="!loading && !(analytics?.attribution || []).length" class="text-sm text-muted">No attribution data yet.</p>
              </div>
            </UCard>
            <UCard variant="soft">
              <template #header><h2 class="font-semibold text-highlighted">Conversions</h2></template>
              <div class="space-y-3">
                <DashboardAnalyticsRow
                  v-for="row in analytics?.conversions || []"
                  :key="`${row.eventName}-${row.stage}`"
                  :label="`${row.eventName.replaceAll('_', ' ')} · ${row.stage.replaceAll('_', ' ')}`"
                  :value="formatCount(row.count)"
                  :percent="row.conversionRate"
                />
                <p v-if="!loading && !(analytics?.conversions || []).length" class="text-sm text-muted">No conversions yet.</p>
              </div>
            </UCard>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <UCard v-for="metric in metricCards" :key="metric.label" variant="soft">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm text-muted">{{ metric.label }}</p>
                  <p class="mt-2 text-2xl font-semibold text-highlighted">{{ loading ? '...' : metric.value }}</p>
                </div>
                <UIcon :name="metric.icon" class="size-5 text-muted" />
              </div>
              <p class="mt-2 text-xs text-muted">{{ metric.detail }}</p>
            </UCard>
          </div>

          <UCard variant="soft">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <h2 class="font-semibold text-highlighted">Traffic trend</h2>
                <UBadge color="neutral" variant="soft">{{ dailyData.length }} days</UBadge>
              </div>
            </template>
            <div v-if="loading" class="h-64 animate-pulse rounded-lg bg-muted/50" />
            <div v-else-if="dailyData.length === 0" class="py-12 text-center text-sm text-muted">No analytics data for this range.</div>
            <div v-else class="h-64">
              <svg viewBox="0 0 800 260" class="h-full w-full" role="img" aria-label="Pageviews and unique sessions over time">
                <line x1="40" y1="218" x2="780" y2="218" class="stroke-muted" stroke-width="1" />
                <polyline :points="pageviewPoints" fill="none" stroke="currentColor" stroke-width="3" class="text-primary" stroke-linecap="round" stroke-linejoin="round" />
                <polyline :points="sessionPoints" fill="none" stroke="currentColor" stroke-width="2" class="text-muted" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 7" />
                <g v-for="point in pageviewDots" :key="point.key">
                  <circle :cx="point.x" :cy="point.y" r="3" class="fill-primary" />
                </g>
              </svg>
            </div>
            <div class="mt-3 flex flex-wrap gap-4 text-xs text-muted">
              <span class="inline-flex items-center gap-2"><span class="size-2 rounded-full bg-primary" /> Pageviews</span>
              <span class="inline-flex items-center gap-2"><span class="h-px w-4 border-t border-dashed border-muted" /> Sessions</span>
            </div>
          </UCard>

          <div class="grid gap-4 xl:grid-cols-2">
            <UCard variant="soft">
              <template #header>
                <h2 class="font-semibold text-highlighted">Countries</h2>
              </template>
              <div class="space-y-3">
                <DashboardAnalyticsRow
                  v-for="country in analytics?.countries || []"
                  :key="country.countryCode"
                  :label="countryName(country.countryCode)"
                  :prefix="countryFlag(country.countryCode)"
                  :value="formatCount(country.views)"
                  :percent="country.percentOfTotal"
                />
                <p v-if="!loading && !(analytics?.countries || []).length" class="text-sm text-muted">No country data yet.</p>
              </div>
            </UCard>

            <UCard variant="soft">
              <template #header>
                <h2 class="font-semibold text-highlighted">Referrers</h2>
              </template>
              <div class="space-y-3">
                <DashboardAnalyticsRow
                  v-for="referrer in analytics?.referrers || []"
                  :key="referrer.source"
                  :label="referrer.source"
                  :value="formatCount(referrer.views)"
                  :percent="referrer.percentOfTotal"
                />
                <p v-if="!loading && !(analytics?.referrers || []).length" class="text-sm text-muted">No referrer data yet.</p>
              </div>
            </UCard>

            <UCard variant="soft">
              <template #header>
                <h2 class="font-semibold text-highlighted">Devices</h2>
              </template>
              <div class="space-y-3">
                <DashboardAnalyticsRow
                  v-for="device in analytics?.devices || []"
                  :key="device.type"
                  :label="device.type"
                  :prefix="deviceIcon(device.type)"
                  :value="formatCount(device.views)"
                  :percent="device.percentOfTotal"
                />
                <p v-if="!loading && !(analytics?.devices || []).length" class="text-sm text-muted">No device data yet.</p>
              </div>
            </UCard>

            <UCard variant="soft">
              <template #header>
                <h2 class="font-semibold text-highlighted">Cities</h2>
              </template>
              <div class="space-y-3">
                <DashboardAnalyticsRow
                  v-for="city in analytics?.cities || []"
                  :key="`${city.city}-${city.region}-${city.countryCode}`"
                  :label="city.region ? `${city.city}, ${city.region}` : city.city"
                  :prefix="countryFlag(city.countryCode)"
                  :value="formatCount(city.views)"
                  :percent="percentOfViews(city.views)"
                />
                <p v-if="!loading && !(analytics?.cities || []).length" class="text-sm text-muted">No city data yet.</p>
              </div>
            </UCard>
          </div>

          <UCard variant="soft">
            <template #header>
              <h2 class="font-semibold text-highlighted">Top pages</h2>
            </template>
            <div class="space-y-3">
              <DashboardAnalyticsRow
                v-for="page in analytics?.topPages || []"
                :key="page.path"
                :label="page.path"
                :value="formatCount(page.views)"
                :percent="page.percentOfTotal"
              />
              <p v-if="!loading && !(analytics?.topPages || []).length" class="text-sm text-muted">No page data yet.</p>
            </div>
          </UCard>
        </div>

        <div v-else-if="tab === 'reviews'" class="space-y-6">
          <div class="grid gap-6 lg:grid-cols-[20rem_1fr]">
            <UCard variant="soft">
              <div class="flex items-baseline gap-2">
                <UIcon name="i-lucide-star" class="size-6 text-primary" />
                <span class="text-4xl font-semibold tabular-nums text-highlighted">{{ reviews.average ?? '—' }}</span>
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ reviews.total === 1 ? '1 approved review' : `${formatCount(reviews.total)} approved reviews` }}
              </p>

              <!-- A review carries one overall rating, so this is its distribution.
                   There are no per-category scores in the schema to break down. -->
              <div class="mt-6 space-y-2">
                <div v-for="bucket in reviews.distribution" :key="bucket.rating" class="flex items-center gap-3">
                  <span class="w-10 shrink-0 text-sm tabular-nums text-muted">{{ bucket.rating }}★</span>
                  <span class="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <span
                      class="block h-full rounded-full bg-primary"
                      :style="{ width: `${reviews.total ? (bucket.count / reviews.total) * 100 : 0}%` }"
                    />
                  </span>
                  <span class="w-8 shrink-0 text-right text-sm tabular-nums text-muted">{{ bucket.count }}</span>
                </div>
              </div>
            </UCard>

            <UCard variant="soft">
              <template #header>
                <h2 class="font-semibold text-highlighted">Recent reviews</h2>
              </template>
              <div v-if="reviews.recent.length" class="divide-y divide-default">
                <article v-for="review in reviews.recent" :key="review.id" class="py-4 first:pt-0 last:pb-0">
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span class="font-medium text-highlighted">{{ review.author }}</span>
                    <span class="text-sm tabular-nums text-primary">{{ '★'.repeat(review.rating) }}</span>
                    <span class="text-xs text-muted">{{ formatDate(review.createdAt.slice(0, 10)) }}</span>
                  </div>
                  <p v-if="review.title" class="mt-1 font-medium text-highlighted">{{ review.title }}</p>
                  <p v-if="review.content" class="mt-1 line-clamp-3 text-sm leading-6 text-muted">{{ review.content }}</p>
                </article>
              </div>
              <p v-else class="py-8 text-center text-sm text-muted">No approved reviews yet.</p>
            </UCard>
          </div>
        </div>

        <div v-else-if="tab === 'opportunities'" class="space-y-6">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UCard v-for="site in setup" :key="site.siteId" variant="soft">
              <template #header>
                <div class="flex items-baseline justify-between gap-3">
                  <h2 class="min-w-0 truncate font-semibold text-highlighted">{{ site.label }}</h2>
                  <span class="shrink-0 text-sm tabular-nums text-muted">{{ site.completed }}/{{ site.total }}</span>
                </div>
              </template>
              <span class="mb-4 block h-2 overflow-hidden rounded-full bg-elevated">
                <span
                  class="block h-full rounded-full bg-primary"
                  :style="{ width: `${site.total ? (site.completed / site.total) * 100 : 0}%` }"
                />
              </span>
              <ul class="space-y-2">
                <li v-for="item in site.items" :key="item.id" class="flex items-center gap-2 text-sm">
                  <UIcon
                    :name="item.done ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
                    class="size-4 shrink-0"
                    :class="item.done ? 'text-success' : 'text-muted'"
                  />
                  <span :class="item.done ? 'text-muted line-through' : 'text-highlighted'">{{ item.label }}</span>
                </li>
              </ul>
            </UCard>
          </div>
        </div>

        <ActivityFeed v-else-if="tab === 'activity'" />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import ActivityFeed from '~/components/dashboard/ActivityFeed.vue'
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard' })

import DashboardAnalyticsRow from '~/lib/components/workspace/dashboard/AnalyticsRow.vue'
import { localDateAt, addLocalDays, formatCalendarDate } from '~/utils/timezone'

type PresetKey = 'last_52_weeks' | 'last_30_days' | 'last_7_days' | 'current_month' | 'custom'

interface AnalyticsResponse {
  metrics: {
    pageViews: number
    uniqueSessions: number
    uniqueVisitors: number
    avgSessionDuration: number
    pagesPerSession: number
    returningVisitors: number
    changePercent: number | null
  }
  dailyData: Array<{ date: string; pageViews: number; sessions: number; avgDuration: number }>
  topPages: Array<{ path: string; views: number; percentOfTotal: number }>
  countries: Array<{ country: string; countryCode: string; views: number; percentOfTotal: number }>
  cities: Array<{ city: string; region: string | null; countryCode: string; views: number }>
  referrers: Array<{ source: string; views: number; percentOfTotal: number }>
  devices: Array<{ type: string; views: number; percentOfTotal: number }>
  attribution: Array<{ source: string; medium: string; campaign: string | null; sessions: number; conversions: number; conversionRate: number }>
  conversions: Array<{ eventName: string; stage: string; count: number; conversionRate: number }>
  period: { startDate: string; endDate: string; timezone: string; analyticsDataStartAt: string | null }
}

const toast = useToast()
const route = useRoute()
const { orgPaths } = useDashboardSiteLinks()

interface InsightsSite { id: string; label: string; subdomain: string | null }
interface InsightsReviews {
  total: number
  average: number | null
  distribution: Array<{ rating: number; count: number }>
  recent: Array<{ id: string; author: string; rating: number; title: string | null; content: string | null; createdAt: string }>
}
interface InsightsSetup {
  siteId: string
  label: string
  completed: number
  total: number
  items: Array<{ id: string; label: string; done: boolean }>
}
interface InsightsResponse {
  sites: InsightsSite[]
  siteId: string | null
  report: AnalyticsResponse
  reviews: InsightsReviews
  setup: InsightsSetup[]
}

// Reviews and Opportunities read what we actually hold. There is no Superhost
// equivalent, and a review carries one overall rating rather than per-category
// scores, so neither is invented here.
const TAB_VALUES = ['views', 'reviews', 'opportunities', 'activity'] as const
type InsightsTab = typeof TAB_VALUES[number]
const isTab = (value: unknown): value is InsightsTab => TAB_VALUES.some(candidate => candidate === value)
const tab = ref<InsightsTab>(isTab(route.query.tab) ? route.query.tab : 'views')
// Back and forward change the query without touching the ref, so the URL is
// read as well as written or the rendered tab drifts from the address bar.
watch(() => route.query.tab, (value) => {
  const next = isTab(value) ? value : 'views'
  if (tab.value !== next) tab.value = next
})
watch(tab, (next) => {
  void navigateTo({ query: next === 'views' ? { ...route.query, tab: undefined } : { ...route.query, tab: next } }, { replace: true })
})
const tabItems = [
  { label: 'Views', value: 'views' as const },
  { label: 'Reviews', value: 'reviews' as const },
  { label: 'Opportunities', value: 'opportunities' as const },
  // Activity is a report like the others, not a screen of its own: it reads
  // what happened and edits nothing, so it belongs beside Views and Reviews
  // rather than on an orphan route nothing linked to.
  { label: 'Activity', value: 'activity' as const },
]

const sites = ref<InsightsSite[]>([])
const reviews = ref<InsightsResponse['reviews']>({ total: 0, average: null, distribution: [], recent: [] })
const setup = ref<InsightsResponse['setup']>([])
// Deep-linked from a site's own overview; null means every site in the org.
const selectedSiteId = ref<string | null>(typeof route.query.siteId === 'string' && route.query.siteId ? route.query.siteId : null)

const presets: Array<{ key: PresetKey; label: string }> = [
  { key: 'last_52_weeks', label: 'Last 52 weeks' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'current_month', label: 'Current month' }
]

const activePreset = ref<PresetKey>('last_30_days')
const loading = ref(true)
const loadError = ref<string | null>(null)
const analytics = ref<AnalyticsResponse | null>(null)
const range = reactive({ startDate: '', endDate: '' })
const isNumberField = (row: unknown, ...fields: string[]): boolean =>
  isRecord(row) && fields.every(field => typeof row[field] === 'number')
const isLabelled = (row: unknown, label: string, ...numbers: string[]): boolean =>
  isRecord(row) && typeof row[label] === 'string' && isNumberField(row, ...numbers)

/**
 * Every field the page reads is checked, not just the containers around them.
 * Checking only that `conversions` was an array let `[{}]` through, and the row
 * then threw on `eventName.replaceAll` while rendering; a missing metric passed
 * too and rendered as a zero through `|| 0`, which reads as real traffic of
 * none rather than as a response we should have rejected.
 */
const isAnalyticsResponse = (value: unknown): value is AnalyticsResponse =>
  isRecord(value)
  && isNumberField(value.metrics, 'pageViews', 'uniqueSessions', 'uniqueVisitors', 'returningVisitors', 'avgSessionDuration', 'pagesPerSession')
  && isRecord(value.metrics)
  && (value.metrics.changePercent === null || typeof value.metrics.changePercent === 'number')
  && isRecord(value.period)
  && typeof value.period.startDate === 'string'
  && typeof value.period.endDate === 'string'
  && typeof value.period.timezone === 'string'
  && (value.period.analyticsDataStartAt === null || typeof value.period.analyticsDataStartAt === 'string')
  && Array.isArray(value.dailyData)
  && value.dailyData.every(row => isLabelled(row, 'date', 'pageViews', 'sessions', 'avgDuration'))
  && Array.isArray(value.topPages)
  && value.topPages.every(row => isLabelled(row, 'path', 'views', 'percentOfTotal'))
  && Array.isArray(value.countries)
  && value.countries.every(row => isLabelled(row, 'countryCode', 'views', 'percentOfTotal'))
  && Array.isArray(value.cities)
  && value.cities.every(row => isLabelled(row, 'city', 'views') && typeof (row as Record<string, unknown>).countryCode === 'string')
  && Array.isArray(value.referrers)
  && value.referrers.every(row => isLabelled(row, 'source', 'views', 'percentOfTotal'))
  && Array.isArray(value.devices)
  && value.devices.every(row => isLabelled(row, 'type', 'views', 'percentOfTotal'))
  && Array.isArray(value.attribution)
  && value.attribution.every(row => isLabelled(row, 'source', 'sessions', 'conversions', 'conversionRate') && typeof (row as Record<string, unknown>).medium === 'string')
  && Array.isArray(value.conversions)
  && value.conversions.every(row => isLabelled(row, 'eventName', 'count', 'conversionRate') && typeof (row as Record<string, unknown>).stage === 'string')

const isInsightsResponse = (value: unknown): value is InsightsResponse =>
  isRecord(value)
  && Array.isArray(value.sites)
  && value.sites.every(site => isRecord(site) && typeof site.id === 'string' && typeof site.label === 'string')
  && (value.siteId === null || typeof value.siteId === 'string')
  && isAnalyticsResponse(value.report)
  && isRecord(value.reviews)
  && typeof value.reviews.total === 'number'
  && Array.isArray(value.reviews.distribution)
  && Array.isArray(value.reviews.recent)
  && Array.isArray(value.setup)
  && value.setup.every(entry => isRecord(entry) && typeof entry.siteId === 'string' && Array.isArray(entry.items))

const initialRange = { ...range }
let latestManualRequestId = 0

/** One read for the filter's options and the figures, so they cannot disagree. */
async function fetchInsights(query: { startDate?: string; endDate?: string }) {
  return await dashboardApi<InsightsResponse>('/api/dashboard/analytics', {
    query: { ...query, ...(selectedSiteId.value ? { siteId: selectedSiteId.value } : {}) },
    validate: isInsightsResponse,
  })
}

const { data: insightsResource, pending: analyticsPending, error: analyticsResourceError } =
  await useAsyncData(
    `dashboard-org-insights:${initialRange.startDate}:${initialRange.endDate}:${selectedSiteId.value ?? 'all'}`,
    () => fetchInsights({}),
    { lazy: import.meta.client },
  )

watch([insightsResource, analyticsPending, analyticsResourceError], ([resource, pending, error]) => {
  if (latestManualRequestId !== 0) return
  loading.value = pending
  if (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load insights'
    return
  }
  if (resource) {
    sites.value = resource.sites
    selectedSiteId.value = resource.siteId
    analytics.value = resource.report
    Object.assign(range, { startDate: resource.report.period.startDate, endDate: resource.report.period.endDate })
    reviews.value = resource.reviews
    setup.value = resource.setup
    loadError.value = null
  }
}, { immediate: true })

function selectSite(siteId: string | null) {
  if (selectedSiteId.value === siteId) return
  selectedSiteId.value = siteId
  // Keeps the filter in the URL so a deep link and a reload agree.
  void navigateTo({ query: siteId ? { ...route.query, siteId } : { ...route.query, siteId: undefined } }, { replace: true })
  loadAnalytics()
}

const dailyData = computed(() => analytics.value?.dailyData || [])
const maxTrendValue = computed(() => Math.max(1, ...dailyData.value.map(day => Math.max(day.pageViews, day.sessions))))
const pageviewPoints = computed(() => toPoints(dailyData.value.map(day => day.pageViews)))
const sessionPoints = computed(() => toPoints(dailyData.value.map(day => day.sessions)))
const pageviewDots = computed(() => toDots(dailyData.value.map(day => day.pageViews)))

const metricCards = computed(() => {
  const metrics = analytics.value?.metrics
  return [
    { label: 'Pageviews', value: formatCount(metrics?.pageViews || 0), detail: metrics?.changePercent == null ? 'Not enough prior data' : `${formatSigned(metrics.changePercent)} vs previous period`, icon: 'i-lucide-chart-bar' },
    { label: 'Unique visitors', value: formatCount(metrics?.uniqueVisitors || 0), detail: `${formatCount(metrics?.returningVisitors || 0)} returning`, icon: 'i-lucide-users' },
    { label: 'Sessions', value: formatCount(metrics?.uniqueSessions || 0), detail: `${formatNumber(metrics?.pagesPerSession || 0)} pages per session`, icon: 'i-lucide-mouse-pointer-click' },
    { label: 'Avg. duration', value: formatDuration(metrics?.avgSessionDuration || 0), detail: 'Average session time', icon: 'i-lucide-clock' }
  ]
})

function presetRange(key: PresetKey, timeZone: string): { startDate: string; endDate: string } {
  const endDate = localDateAt(new Date(), timeZone)
  let startDate = endDate
  if (key === 'last_52_weeks') startDate = addLocalDays(endDate, -363)
  if (key === 'last_30_days') startDate = addLocalDays(endDate, -29)
  if (key === 'last_7_days') startDate = addLocalDays(endDate, -6)
  if (key === 'current_month') startDate = `${endDate.slice(0, 8)}01`
  return { startDate, endDate }
}

function currentTimeZone(): string {
  if (!analytics.value) throw new Error('Load the selected analytics timezone before choosing dates')
  return analytics.value.period.timezone
}

function applyPreset(key: PresetKey) {
  activePreset.value = key
  Object.assign(range, presetRange(key, currentTimeZone()))
  loadAnalytics()
}

function markCustomAndLoad() {
  activePreset.value = 'custom'
  loadAnalytics()
}

async function loadAnalytics() {
  const requestId = ++latestManualRequestId
  loading.value = true
  loadError.value = null
  try {
    const response = await fetchInsights({ startDate: range.startDate, endDate: range.endDate })
    if (requestId !== latestManualRequestId) return
    sites.value = response.sites
    selectedSiteId.value = response.siteId
    analytics.value = response.report
    Object.assign(range, { startDate: response.report.period.startDate, endDate: response.report.period.endDate })
    reviews.value = response.reviews
    setup.value = response.setup
  } catch (error) {
    if (requestId !== latestManualRequestId) return
    loadError.value = error instanceof Error ? error.message : 'Failed to load insights'
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load insights', color: 'error' })
  } finally {
    if (requestId === latestManualRequestId) loading.value = false
  }
}

function toPoints(values: number[]): string {
  if (!values.length) return ''
  const width = 740
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((value, index) => {
    const x = 40 + (index * step)
    const y = 218 - ((value / maxTrendValue.value) * 178)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function toDots(values: number[]) {
  if (values.length > 60) return []
  const width = 740
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((value, index) => ({
    key: `${index}-${value}`,
    x: 40 + (index * step),
    y: 218 - ((value / maxTrendValue.value) * 178)
  }))
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function formatSigned(value: number): string {
  if (value > 0) return `+${value}%`
  return `${value}%`
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function formatDate(value: string): string {
  return formatCalendarDate(value, 'en')
}

function countryFlag(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode) || countryCode === 'XX') return '🏳'
  return countryCode
    .split('')
    .map(char => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('')
}

function countryName(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode) || countryCode === 'XX') return 'Unknown'
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode
  } catch {
    return countryCode
  }
}

function deviceIcon(type: string): string {
  if (type === 'Mobile') return '📱'
  if (type === 'Tablet') return '▭'
  if (type === 'Bot') return '◇'
  if (type === 'Desktop') return '▣'
  return '•'
}

function percentOfViews(views: number): number {
  const total = analytics.value?.metrics.pageViews || 0
  return total > 0 ? Math.round((views / total) * 100) : 0
}

useSeoMeta({ title: 'Insights | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
