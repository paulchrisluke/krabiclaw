<template>
  <DashboardIndexPanel id="organization-insights" title="Insights">
    <div class="mx-auto w-full max-w-5xl space-y-6 pb-10">
      <UAlert
        v-if="loadError"
        color="error"
        variant="soft"
        title="Analytics could not be loaded"
        :description="loadError"
        :actions="[{ label: 'Try again', onClick: () => refresh() }]"
      />
      <UTabs
        v-model="tab"
        :items="tabItems"
        :content="false"
        class="w-full"
      />

      <div v-if="tab === 'views'" class="flex justify-end">
        <div class="inline-flex gap-0.5 rounded-lg bg-elevated p-0.5" role="group" aria-label="Date range">
          <button v-for="days in [7, 30]" :key="days" type="button"
            :aria-pressed="activeDays === days" :disabled="loading || !analytics"
            class="rounded-md px-3 py-1 text-sm transition-colors disabled:opacity-50"
            :class="activeDays === days ? 'bg-accented text-highlighted' : 'text-muted hover:text-highlighted'"
            @click="applyPreset(days)">{{ days }}d</button>
        </div>
      </div>
      <div v-if="loading" class="space-y-4" role="status" aria-label="Loading insights">
        <USkeleton class="h-28 w-full rounded-2xl" />
        <USkeleton class="h-80 w-full rounded-2xl" />
      </div>

      <div v-if="tab === 'views' && analytics && !loading && !loadError" class="space-y-8">

        <UCard variant="soft" class="rounded-2xl">
          <div class="grid grid-cols-2 gap-x-6 gap-y-6">
            <div v-for="metric in metricCards" :key="metric.label">
              <p class="text-sm text-muted">{{ metric.label }}</p>
              <p class="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-highlighted">{{ metric.value }}</p>
              <p class="mt-2 text-xs leading-5 text-muted">{{ metric.detail }}</p>
            </div>
          </div>
        </UCard>

        <UCard variant="soft" class="rounded-2xl">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold text-highlighted">Traffic trend</h2>
              <UBadge color="neutral" variant="soft" class="rounded-2xl">{{ dailyData.length }} days</UBadge>
            </div>
          </template>
          <AnalyticsTrendChart label="Daily pageviews and sessions" :dates="dailyData.map(day => day.date)" :series="trafficSeries" />
        </UCard>

        <UCard variant="soft" class="rounded-2xl">
          <template #header><h2 class="font-semibold text-highlighted">Top pages</h2></template>
          <table v-if="analytics.topPages.length" class="w-full table-fixed text-left text-sm">
            <thead class="text-xs text-muted"><tr><th class="w-3/5 pb-3 font-medium">Page</th><th class="pb-3 text-right font-medium">Views</th><th class="pb-3 text-right font-medium">Share</th></tr></thead>
            <tbody class="divide-y divide-default">
              <tr v-for="page in analytics.topPages" :key="page.path">
                <td class="break-words py-3 pr-4 font-medium text-highlighted">{{ page.path }}</td>
                <td class="py-3 text-right tabular-nums">{{ formatCount(page.views) }}</td>
                <td class="py-3 text-right tabular-nums text-muted">{{ page.percentOfTotal }}%</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-sm text-muted">No page data yet.</p>
        </UCard>

        <div class="space-y-6">
          <UCard variant="soft" class="rounded-2xl">
            <template #header><h2 class="font-semibold text-highlighted">Traffic sources</h2></template>
            <div v-if="analytics.attribution.length" class="overflow-x-auto">
              <table class="w-full text-left text-sm">
                <thead class="text-xs text-muted"><tr><th class="pb-3 font-medium">Source / campaign</th><th class="pb-3 text-right font-medium">Sessions</th><th class="pb-3 pl-4 text-right font-medium">Converting</th></tr></thead>
                <tbody class="divide-y divide-default">
                  <tr v-for="row in analytics.attribution" :key="JSON.stringify([row.source, row.medium, row.campaign, row.content])">
                    <td class="py-3 pr-4"><p class="font-medium text-highlighted">{{ row.source }} <span class="font-normal text-muted">/ {{ row.medium }}</span></p><p v-if="row.campaign || row.content" class="mt-1 text-xs text-muted">{{ [row.campaign, row.content].filter(Boolean).join(' · ') }}</p></td>
                    <td class="py-3 text-right tabular-nums">{{ formatCount(row.sessions) }}</td>
                    <td class="py-3 pl-4 text-right tabular-nums">{{ formatCount(row.convertingSessions) }}<span v-if="row.sessionConversionRate !== null" class="ml-2 text-xs text-muted">{{ formatNumber(row.sessionConversionRate) }}%</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="text-sm text-muted">No attribution data yet.</p>
          </UCard>
          <UCard variant="soft" class="rounded-2xl">
            <template #header><h2 class="font-semibold text-highlighted">Conversions</h2></template>
            <p class="mb-4 text-3xl font-semibold tabular-nums text-highlighted">{{ formatCount(analytics.dailyConversions.reduce((total, day) => total + day.events, 0)) }}</p>
            <AnalyticsTrendChart label="Daily conversions" :dates="analytics.dailyConversions.map(day => day.date)" :series="conversionSeries" />
            <div v-if="outcomes.length" class="mt-5 divide-y divide-default text-sm">
              <div v-for="row in outcomes" :key="`${row.eventName}-${row.stage}`" class="flex justify-between gap-4 py-3">
                <span class="text-muted">{{ row.eventName.replaceAll('_', ' ') }}</span>
                <span class="tabular-nums">{{ formatCount(row.events) }}</span>
              </div>
            </div>
          </UCard>
          <UCard variant="soft" class="rounded-2xl">
            <template #header><h2 class="font-semibold text-highlighted">Pageviews by language</h2></template>
            <div class="space-y-4">
              <DashboardAnalyticsRow
                v-for="row in nativeLanguages.rows"
                :key="row.language ?? 'unknown'"
                :label="row.language ?? 'Language not recorded'"
                :value="`${formatCount(row.pageViews)} pageviews · ${formatCount(row.sessions)} sessions`"
                :percent="nativeLanguages.totalPageViews ? Math.round(row.pageViews / nativeLanguages.totalPageViews * 100) : 0"
              />
              <p v-if="!nativeLanguages.loading && !nativeLanguages.rows.length && !nativeLanguages.error" class="text-sm text-muted">No pageviews recorded in this range.</p>
              <p v-if="nativeLanguages.loading" class="text-sm text-muted">Loading languages…</p>
              <p v-if="nativeLanguages.error" class="text-sm text-error">{{ nativeLanguages.error }}</p>
              <p v-if="nativeLanguages.rows.length" class="text-xs text-muted">{{ formatCount(nativeLanguages.totalSessions) }} distinct sessions across all languages (not the sum of the rows).</p>
              <UButton v-if="nativeLanguages.cursor" size="sm" variant="soft" :loading="nativeLanguages.loading" @click="loadLanguages(true)">Show more</UButton>
            </div>
          </UCard>
          <UCard v-if="analytics.values.length || analytics.bookingValue.length" variant="soft" class="rounded-2xl">
            <template #header><h2 class="font-semibold text-highlighted">Value</h2></template>
            <div class="space-y-4">
              <DashboardAnalyticsRow
                v-for="row in analytics.values"
                :key="`${row.eventName}-${row.basis}-${row.currency}`"
                :label="`${row.eventName.replaceAll('_', ' ')} · ${row.basis}`"
                :value="`${formatMoney(row.valueMinor, row.currency)}${row.collectedMinor !== null ? ` (${formatMoney(row.collectedMinor, row.currency)} collected)` : ''} · ${formatCount(row.events)} events`"
                :percent="0"
              />
              <DashboardAnalyticsRow
                v-for="row in analytics.net"
                :key="`net-${row.currency}`"
                :label="`Net collected · ${row.currency}`"
                :value="`${formatMoney(row.netMinor, row.currency)} (${formatMoney(row.collectedMinor, row.currency)} − ${formatMoney(row.refundedMinor, row.currency)} refunded)`"
                :percent="0"
              />
              <DashboardAnalyticsRow
                v-for="row in analytics.attributedValue"
                :key="`attributed-${row.source}-${row.medium}-${row.campaign}-${row.content}-${row.currency}`"
                :label="`Revenue · ${row.source || 'unattributed'} / ${row.medium || 'unattributed'}${row.campaign ? ` · ${row.campaign}` : ''}${row.content ? ` · ${row.content}` : ''}`"
                :value="`${formatMoney(row.netMinor, row.currency)} net (${formatMoney(row.collectedMinor, row.currency)} collected − ${formatMoney(row.refundedMinor, row.currency)} refunded) · ${formatCount(row.purchases)} purchases`"
                :percent="0"
              />
              <DashboardAnalyticsRow
                v-for="row in analytics.bookingValue"
                :key="`booking-${row.productId}-${row.locationId}-${row.currency}`"
                :label="`Quoted booking value · ${row.productName || 'price unknown'}`"
                :value="`${row.currency ? formatMoney(row.quotedValueMinor, row.currency) : 'value unknown'} · ${formatCount(row.valuedBookings)} of ${formatCount(row.bookings)} bookings valued`"
                :percent="0"
              />
              <p class="text-xs text-muted">Quoted booking value is the price shown when a booking was made, not revenue. Currencies are never added together.</p>
            </div>
          </UCard>
          <UCard v-if="analytics.signupCohort.signups" variant="soft" class="rounded-2xl">
            <template #header><h2 class="font-semibold text-highlighted">Signup funnel</h2></template>
            <div class="space-y-6">
              <div class="grid grid-cols-3 gap-4" aria-label="Signup conversion funnel">
                <div v-for="stage in [
                  { label: 'Signups', count: analytics.signupCohort.signups },
                  { label: 'Onboarded', count: analytics.signupCohort.onboardedSignups },
                  { label: 'Paid', count: analytics.signupCohort.firstPaidSignups },
                ]" :key="stage.label" class="space-y-3">
                  <p class="text-sm text-muted">{{ stage.label }}</p>
                  <p class="text-3xl font-semibold tabular-nums text-highlighted">{{ formatCount(stage.count) }}</p>
                  <div class="h-2 overflow-hidden rounded-full bg-accented" aria-hidden="true">
                    <div class="h-full rounded-full bg-primary" :style="{ width: `${stage.count / analytics.signupCohort.signups * 100}%` }" />
                  </div>
                  <p class="text-xs tabular-nums text-muted">{{ Math.round(stage.count / analytics.signupCohort.signups * 100) }}%</p>
                </div>
              </div>
              <p class="text-xs text-muted">Progress of people who signed up in this period, through the businesses they own.</p>
              <details class="border-t border-default pt-4">
                <summary class="cursor-pointer text-sm font-medium text-highlighted">By campaign</summary>
                <div class="mt-4 overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead class="text-xs text-muted"><tr>
                      <th scope="col" class="pb-3 text-left font-medium">Source / campaign</th>
                      <th v-for="label in ['Signups', 'Onboarded', 'Paid']" :key="label" scope="col" class="pb-3 pl-4 text-right font-medium">{{ label }}</th>
                    </tr></thead>
                    <tbody class="divide-y divide-default">
                      <tr v-for="row in analytics.signupCohort.bySignupAttribution" :key="`${row.source}-${row.medium}-${row.campaign || ''}-${row.content || ''}`">
                        <td class="py-3">
                          <p class="text-highlighted">{{ row.source || 'Unattributed' }} / {{ row.medium || 'Unattributed' }}</p>
                          <p v-if="row.campaign" class="mt-1 break-all text-xs text-muted">{{ row.campaign }}</p>
                          <p v-if="row.content" class="mt-1 break-all text-xs text-muted">{{ row.content }}</p>
                        </td>
                        <td v-for="(count, index) in [row.signups, row.onboardedSignups, row.firstPaidSignups]" :key="index" class="py-3 pl-4 text-right tabular-nums">{{ formatCount(count) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </UCard>
        </div>

        <div class="space-y-6">
          <UCard variant="soft" class="rounded-2xl">
            <template #header>
              <h2 class="font-semibold text-highlighted">Countries</h2>
            </template>
            <div class="space-y-4">
              <DashboardAnalyticsRow
                v-for="country in analytics.countries"
                :key="country.countryCode"
                :label="countryName(country.countryCode)"
                :prefix="countryFlag(country.countryCode)"
                :value="formatCount(country.views)"
                :percent="country.percentOfTotal"
              />
              <p v-if="!analytics.countries.length" class="text-sm text-muted">No country data yet.</p>
            </div>
          </UCard>

          <UCard variant="soft" class="rounded-2xl">
            <template #header>
              <h2 class="font-semibold text-highlighted">Referrers</h2>
            </template>
            <div class="space-y-4">
              <DashboardAnalyticsRow
                v-for="referrer in analytics.referrers"
                :key="referrer.source"
                :label="referrer.source"
                :value="formatCount(referrer.views)"
                :percent="referrer.percentOfTotal"
              />
              <p v-if="!analytics.referrers.length" class="text-sm text-muted">No referrer data yet.</p>
            </div>
          </UCard>

          <UCard variant="soft" class="rounded-2xl">
            <template #header>
              <h2 class="font-semibold text-highlighted">Devices</h2>
            </template>
            <div class="space-y-4">
              <DashboardAnalyticsRow
                v-for="device in analytics.devices"
                :key="device.type"
                :label="device.type"
                :prefix="deviceIcon(device.type)"
                :value="formatCount(device.views)"
                :percent="device.percentOfTotal"
              />
              <p v-if="!analytics.devices.length" class="text-sm text-muted">No device data yet.</p>
            </div>
          </UCard>

          <UCard variant="soft" class="rounded-2xl">
            <template #header>
              <h2 class="font-semibold text-highlighted">Cities</h2>
            </template>
            <div class="space-y-4">
              <DashboardAnalyticsRow
                v-for="city in analytics.cities"
                :key="`${city.city}-${city.region}-${city.countryCode}`"
                :label="city.region ? `${city.city}, ${city.region}` : city.city"
                :prefix="countryFlag(city.countryCode)"
                :value="formatCount(city.views)"
                :percent="percentOfViews(city.views)"
              />
              <p v-if="!analytics.cities.length" class="text-sm text-muted">No city data yet.</p>
            </div>
          </UCard>
        </div>


      </div>

      <div v-else-if="tab === 'reviews' && reviews && !loading && !loadError" class="space-y-6">
        <div class="space-y-6">
          <UCard variant="soft" class="rounded-2xl">
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

          <UCard variant="soft" class="rounded-2xl">
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

      <div v-else-if="tab === 'opportunities' && setup && !loading && !loadError" class="space-y-6">
        <div class="space-y-6">
          <UCard v-if="setup" variant="soft" class="rounded-2xl">
            <template #header>
              <div class="flex items-baseline justify-between gap-3">
                <h2 class="min-w-0 truncate font-semibold text-highlighted">{{ setup.label }}</h2>
                <span class="shrink-0 text-sm tabular-nums text-muted">{{ setup.completed }}/{{ setup.total }}</span>
              </div>
            </template>
            <span class="mb-4 block h-2 overflow-hidden rounded-full bg-elevated">
              <span
                class="block h-full rounded-full bg-primary"
                :style="{ width: `${setup.total ? (setup.completed / setup.total) * 100 : 0}%` }"
              />
            </span>
            <ul class="space-y-2">
              <li v-for="item in setup.items" :key="item.id" class="flex items-center gap-2 text-sm">
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
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import ActivityFeed from '~/components/dashboard/ActivityFeed.vue'
import AnalyticsTrendChart from '~/components/dashboard/AnalyticsTrendChart.vue'
import { CONVERSION_EVENT_CATALOG, ORGANIZATION_CONVERSION_EVENT_NAMES } from '~/utils/organization-conversion-events'
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard' })

import DashboardAnalyticsRow from '~/lib/components/workspace/dashboard/AnalyticsRow.vue'
import { localDateAt, addLocalDays, formatCalendarDate } from '~/utils/timezone'
import { organizationAnalyticsSchema, type AnalyticsReport, type OrganizationAnalyticsReport } from '~/shared/analytics-report'
import { currencyFractionDigits, isCurrencyCode } from '~/shared/currencies'

const route = useRoute()
const scope = useDashboardRouteScope()

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

const activeDays = ref(30)
const requestedRange = ref<{ startDate?: string; endDate?: string }>({})
const isNumberField = (row: unknown, ...fields: string[]): boolean =>
  isRecord(row) && fields.every(field => typeof row[field] === 'number')

const { data: insightsResource, pending: loading, error: resourceError, refresh } = await useAsyncData(
  () => `dashboard-org-insights:${scope.value?.orgSlug}:${requestedRange.value.startDate ?? ''}:${requestedRange.value.endDate ?? ''}`,
  () => dashboardApi<OrganizationAnalyticsReport>('/api/dashboard/analytics', {
    query: requestedRange.value,
    validate: (value): value is OrganizationAnalyticsReport => {
      const result = organizationAnalyticsSchema.safeParse(value)
      if (!result.success) {
        throw new ApiClientError(
          `Invalid analytics response: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
          502, 'INVALID_ANALYTICS_RESPONSE', null,
        )
      }
      return true
    },
  }),
  { lazy: true },
)
const analytics = computed<AnalyticsReport | null>(() => insightsResource.value?.report ?? null)
const reviews = computed(() => insightsResource.value?.reviews)
const setup = computed(() => insightsResource.value?.setup)
const loadError = computed(() => resourceError.value?.message ?? null)
// The same native query MCP exposes (query_organization_analytics), asked for the pageviews of the
// selected range grouped by language. Every group is reachable: "Show more" follows the cursor.
const nativeLanguages = reactive({
  rows: [] as Array<{ language: string | null; pageViews: number; sessions: number }>,
  totalPageViews: 0, totalSessions: 0, cursor: null as string | null, loading: false,
  error: null as string | null,
})
let latestLanguageRequest = 0
async function loadLanguages(more: boolean) {
  const requestId = ++latestLanguageRequest
  const period = analytics.value?.period
  if (!more) {
    nativeLanguages.rows = []
    nativeLanguages.cursor = null
    nativeLanguages.error = null
  }
  if (!period) return
  nativeLanguages.loading = true
  nativeLanguages.error = null
  try {
    const response = await dashboardApi<{
      rows: Array<{ dimensions: { locale: string | null }; metrics: { page_views: number; sessions: number } }>
      next_cursor: string | null
      totals: { page_views: { value: number }; sessions: { value: number } }
    }>('/api/dashboard/analytics-query', {
      method: 'POST',
      body: {
        mode: 'breakdown', start_date: period.startDate, end_date: period.endDate, filters: { kind: 'pageview' },
        dimensions: ['locale'], metrics: ['page_views', 'sessions'], limit: 20,
        ...(more && nativeLanguages.cursor ? { cursor: nativeLanguages.cursor } : {}),
      },
      validate: (value): value is never => isRecord(value) && Array.isArray(value.rows)
        && value.rows.every(row => isRecord(row) && isRecord(row.dimensions)
          && (row.dimensions.locale === null || typeof row.dimensions.locale === 'string')
          && isNumberField(row.metrics, 'page_views', 'sessions'))
        && (value.next_cursor === null || typeof value.next_cursor === 'string')
        && isRecord(value.totals) && isNumberField(value.totals.page_views, 'value') && isNumberField(value.totals.sessions, 'value'),
    })
    if (requestId !== latestLanguageRequest) return
    const rows = response.rows.map(row => ({ language: row.dimensions.locale, pageViews: row.metrics.page_views, sessions: row.metrics.sessions }))
    nativeLanguages.rows = more ? [...nativeLanguages.rows, ...rows] : rows
    nativeLanguages.cursor = response.next_cursor
    nativeLanguages.totalPageViews = response.totals.page_views.value
    nativeLanguages.totalSessions = response.totals.sessions.value
  } catch (error) {
    if (requestId === latestLanguageRequest) nativeLanguages.error = error instanceof Error ? error.message : 'Could not load pageviews by language'
  } finally {
    if (requestId === latestLanguageRequest) nativeLanguages.loading = false
  }
}
watch(() => analytics.value ? `${scope.value?.orgSlug}:${analytics.value.period.startDate}:${analytics.value.period.endDate}` : null, (key) => { if (key) void loadLanguages(false) }, { immediate: true })

const dailyData = computed(() => analytics.value?.dailyData || [])
const trafficSeries = computed(() => [
  { label: 'Pageviews', values: dailyData.value.map(day => day.pageViews), color: 'var(--ui-primary)' },
  { label: 'Sessions', values: dailyData.value.map(day => day.sessions), color: 'var(--ui-info)' },
])
const conversionSeries = computed(() => [
  { label: 'Conversions', values: analytics.value?.dailyConversions.map(day => day.events) ?? [], color: 'var(--ui-primary)' },
])
const outcomeNames = new Set<string>(ORGANIZATION_CONVERSION_EVENT_NAMES.filter(name => CONVERSION_EVENT_CATALOG[name].outcome))
const outcomes = computed(() => analytics.value?.conversions.filter(row => outcomeNames.has(row.eventName)) ?? [])

const metricCards = computed(() => {
  const metrics = analytics.value?.metrics
  if (!metrics) return []
  return [
    { label: 'Pageviews', value: formatCount(metrics.pageViews), detail: metrics.changePercent === null ? 'Not enough prior data' : `${formatSigned(metrics.changePercent)} vs previous period`, icon: 'i-lucide-chart-bar' },
    { label: 'Unique visitors', value: formatCount(metrics.uniqueVisitors), detail: `${formatCount(metrics.returningVisitors)} returning`, icon: 'i-lucide-users' },
    { label: 'Sessions', value: formatCount(metrics.uniqueSessions), detail: `${formatNumber(metrics.pagesPerSession)} pages per session`, icon: 'i-lucide-mouse-pointer-click' },
    { label: 'Avg. duration', value: formatDuration(metrics.avgSessionDuration), detail: 'Average session time', icon: 'i-lucide-clock' }
  ]
})

function applyPreset(days: number) {
  if (!analytics.value || activeDays.value === days) return
  activeDays.value = days
  const endDate = localDateAt(new Date(), analytics.value.period.timezone)
  requestedRange.value = { startDate: addLocalDays(endDate, 1 - days), endDate }
}

function formatMoney(minor: number, currency: string): string {
  if (!isCurrencyCode(currency)) throw new Error(`Unsupported currency in analytics report: ${currency}`)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 10 ** currencyFractionDigits(currency))
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

useSeoMeta({ title: 'Insights | Krabiclaw Dashboard', robots: 'noindex, nofollow' })
</script>
