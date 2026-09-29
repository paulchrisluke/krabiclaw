<template>
  <DashboardIndexPanel id="organization-insights" title="Insights">
    <div class="space-y-6">
      <UAlert
        v-if="loadError"
        color="error"
        variant="soft"
        title="Analytics could not be loaded"
        :description="loadError"
      />
      <UTabs
        v-model="tab"
        :items="tabItems"
        :content="false"
        class="w-full"
      />

      <UCard v-if="tab === 'views' || tab === 'social'" variant="soft">
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

      <div v-if="tab === 'views'" class="space-y-6">

        <div class="grid gap-4 xl:grid-cols-2">
          <UCard variant="soft">
            <template #header><h2 class="font-semibold text-highlighted">Attribution</h2></template>
            <div class="space-y-3">
              <DashboardAnalyticsRow
                v-for="row in analytics?.attribution || []"
                :key="`${row.source}-${row.medium}-${row.campaign || ''}-${row.content || ''}`"
                :label="`${row.source} / ${row.medium}${row.campaign ? ` · ${row.campaign}` : ''}${row.content ? ` · ${row.content}` : ''}`"
                :value="`${formatCount(row.sessions)} sessions · ${formatCount(row.convertingSessions)} converting`"
                :percent="row.sessionConversionRate ?? 0"
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
                :value="`${formatCount(row.events)} events · ${formatCount(row.convertingSessions)} sessions${row.nonbrowserEvents ? ` · ${formatCount(row.nonbrowserEvents)} without a browser` : ''}`"
                :percent="row.sessionConversionRate ?? 0"
              />
              <p v-if="!loading && !(analytics?.conversions || []).length" class="text-sm text-muted">No conversions yet.</p>
            </div>
          </UCard>
          <UCard variant="soft">
            <template #header><h2 class="font-semibold text-highlighted">Pageviews by language</h2></template>
            <div class="space-y-3">
              <DashboardAnalyticsRow
                v-for="row in nativeLanguages.rows"
                :key="row.language ?? 'unknown'"
                :label="row.language ?? 'Language not recorded'"
                :value="`${formatCount(row.pageViews)} pageviews · ${formatCount(row.sessions)} sessions`"
                :percent="nativeLanguages.totalPageViews ? Math.round(row.pageViews / nativeLanguages.totalPageViews * 100) : 0"
              />
              <p v-if="!nativeLanguages.rows.length && !nativeLanguages.error" class="text-sm text-muted">No pageviews recorded in this range.</p>
              <p v-if="nativeLanguages.error" class="text-sm text-error">{{ nativeLanguages.error }}</p>
              <p v-if="nativeLanguages.detailUnavailable" class="text-xs text-muted">{{ nativeLanguages.detailUnavailable }}</p>
              <p v-if="nativeLanguages.rows.length" class="text-xs text-muted">{{ formatCount(nativeLanguages.totalSessions) }} distinct sessions across all languages (not the sum of the rows).</p>
              <UButton v-if="nativeLanguages.cursor" size="sm" variant="soft" :loading="nativeLanguages.loading" @click="loadLanguages(true)">Show more</UButton>
            </div>
          </UCard>
          <UCard v-if="(analytics?.values || []).length || (analytics?.bookingValue || []).length" variant="soft">
            <template #header><h2 class="font-semibold text-highlighted">Value</h2></template>
            <div class="space-y-3">
              <DashboardAnalyticsRow
                v-for="row in analytics?.values || []"
                :key="`${row.eventName}-${row.basis}-${row.currency}`"
                :label="`${row.eventName.replaceAll('_', ' ')} · ${row.basis}`"
                :value="`${formatMoney(row.valueMinor, row.currency)}${row.collectedMinor !== null ? ` (${formatMoney(row.collectedMinor, row.currency)} collected)` : ''} · ${formatCount(row.events)} events`"
                :percent="0"
              />
              <DashboardAnalyticsRow
                v-for="row in analytics?.net || []"
                :key="`net-${row.currency}`"
                :label="`Net collected · ${row.currency}`"
                :value="`${formatMoney(row.netMinor, row.currency)} (${formatMoney(row.collectedMinor, row.currency)} − ${formatMoney(row.refundedMinor, row.currency)} refunded)`"
                :percent="0"
              />
              <DashboardAnalyticsRow
                v-for="row in analytics?.attributedValue || []"
                :key="`attributed-${row.source}-${row.medium}-${row.campaign}-${row.content}-${row.currency}`"
                :label="`Revenue · ${row.source || 'unattributed'} / ${row.medium || 'unattributed'}${row.campaign ? ` · ${row.campaign}` : ''}${row.content ? ` · ${row.content}` : ''}`"
                :value="`${formatMoney(row.netMinor, row.currency)} net (${formatMoney(row.collectedMinor, row.currency)} collected − ${formatMoney(row.refundedMinor, row.currency)} refunded) · ${formatCount(row.purchases)} purchases`"
                :percent="0"
              />
              <DashboardAnalyticsRow
                v-for="row in analytics?.bookingValue || []"
                :key="`booking-${row.productId}-${row.locationId}-${row.currency}`"
                :label="`Quoted booking value · ${row.productName || 'price unknown'}`"
                :value="`${row.currency ? formatMoney(row.quotedValueMinor, row.currency) : 'value unknown'} · ${formatCount(row.valuedBookings)} of ${formatCount(row.bookings)} bookings valued`"
                :percent="0"
              />
              <p class="text-xs text-muted">Quoted booking value is the price shown when a booking was made, not revenue. Currencies are never added together.</p>
            </div>
          </UCard>
          <UCard v-if="analytics?.signupCohort.signups" variant="soft">
            <template #header><h2 class="font-semibold text-highlighted">Signup cohort</h2></template>
            <div class="space-y-3">
              <DashboardAnalyticsRow
                v-for="row in analytics?.signupCohort.bySignupAttribution || []"
                :key="`${row.source}-${row.medium}-${row.campaign || ''}-${row.content || ''}`"
                :label="`${row.source || 'unattributed'} / ${row.medium || 'unattributed'}${row.campaign ? ` · ${row.campaign}` : ''}${row.content ? ` · ${row.content}` : ''}`"
                :value="`${formatCount(row.signups)} signups · ${formatCount(row.onboardedSignups)} onboarded · ${formatCount(row.firstPaidSignups)} paid`"
                :percent="row.signups ? Math.round(row.firstPaidSignups / row.signups * 100) : 0"
              />
              <p class="text-xs text-muted">Counted per signup, through the organizations that user owns, observed through {{ analytics?.signupCohort.observedThrough }}.</p>
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

      <div v-else-if="tab === 'social'" class="space-y-6">
        <p class="text-sm text-muted">Facebook and Instagram report their own audiences and periods. Counts from different networks are shown separately.</p>
        <UCard v-for="provider in socialProviders" :key="provider.source" variant="soft">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">{{ provider.source === 'facebook' ? 'Facebook Page' : 'Instagram' }} · {{ provider.targetName ?? 'Not connected' }}</h2>
                <p v-if="provider.targetId" class="text-xs text-muted">{{ provider.targetId }} · Graph API {{ provider.apiVersion }} · {{ provider.fetchedAt ? `Read ${formatDateTime(provider.fetchedAt)}` : 'No current read' }}</p>
              </div>
              <UBadge :color="provider.status === 'connected' ? 'success' : provider.status === 'disconnected' ? 'neutral' : 'error'" variant="soft">{{ provider.status.replaceAll('_', ' ') }}</UBadge>
            </div>
          </template>
          <UAlert v-if="provider.error" :color="provider.status === 'disconnected' ? 'neutral' : 'error'" variant="soft" :description="provider.error" />
          <UAlert v-else-if="provider.metrics.some(metric => metric.status === 'permission_denied')" color="error" variant="soft" description="This connection cannot read some insight metrics. Reconnect it with insights permission." />
          <UButton v-if="provider.status === 'disconnected' || provider.status === 'permission_denied' || provider.metrics.some(metric => metric.status === 'permission_denied')"
            class="mt-3" variant="soft" :to="`/dashboard/${String(route.params.orgSlug)}/settings/integrations/${provider.source}`">Connect or review {{ provider.source === 'facebook' ? 'Facebook' : 'Instagram' }}</UButton>
          <div v-if="provider.status === 'connected'" class="space-y-6">
            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div v-for="metric in provider.metrics" :key="metric.name" class="rounded-lg border border-default p-3">
                <p class="text-sm font-medium text-highlighted">{{ metricLabel(metric.name) }}</p>
                <p class="mt-2 text-2xl tabular-nums">{{ metric.status === 'available' && metric.value !== null ? formatCount(metric.value) : '—' }}</p>
                <p class="text-xs text-muted">{{ metric.period.replaceAll('_', ' ') }} · {{ metric.unit }} · {{ metric.status.replaceAll('_', ' ') }}</p>
                <p v-if="metric.previousStatus === 'available' && metric.previousValue !== null" class="text-xs text-muted">Previous equal period: {{ formatCount(metric.previousValue) }}</p>
                <p v-if="metric.status === 'available' && metric.value !== null && metric.previousStatus === 'available' && metric.previousValue !== null" class="text-xs text-muted">
                  Change: {{ metric.value - metric.previousValue >= 0 ? '+' : '' }}{{ formatCount(metric.value - metric.previousValue) }} vs previous equal period
                </p>
                <p v-if="metric.reason" class="mt-1 text-xs text-muted">{{ metric.reason }}</p>
              </div>
            </div>
            <div>
              <h3 class="font-medium text-highlighted">Content published in this range · ranked by {{ provider.source === 'facebook' ? 'post media views' : 'media views' }}</h3>
              <p v-if="provider.contentCoverageReason" class="mt-1 text-sm text-muted">{{ provider.contentCoverageReason }}</p>
              <p v-if="provider.nextCursor" class="mt-1 text-xs text-muted">Ranked among loaded posts. Load every page to inspect all posts in this range.</p>
              <p v-if="provider.contentCoverage === 'complete' && !provider.content.length" class="mt-2 text-sm text-muted">No native posts were published in this range.</p>
              <div v-else class="mt-3 grid gap-3 lg:grid-cols-2">
                <div v-for="item in sortedSocialContent(provider)" :key="item.id" class="rounded-lg border border-default p-4">
                  <a v-if="item.permalink" :href="item.permalink" target="_blank" rel="noopener noreferrer" class="font-medium text-primary underline">{{ item.caption?.trim().slice(0, 95) || `${item.kind} post` }}</a>
                  <p v-else class="font-medium text-highlighted">{{ item.caption?.trim().slice(0, 95) || `${item.kind} post` }}</p>
                  <p class="mt-1 text-xs text-muted">{{ item.kind }} · {{ formatDateTime(item.publishedAt) }} · {{ item.id }}</p>
                  <div class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <span v-for="metric in item.metrics" :key="metric.name" :title="metric.reason ?? ''">
                      {{ metricLabel(metric.name) }}: {{ metric.status === 'available' && metric.value !== null ? formatCount(metric.value) : metric.status.replaceAll('_', ' ') }}
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-muted">Content metrics are lifetime counts; posts are selected by their publication date.</p>
                </div>
              </div>
              <UAlert v-if="socialPageError[provider.source]" class="mt-3" color="error" variant="soft" :description="socialPageError[provider.source] ?? undefined" />
              <UButton v-if="provider.nextCursor" class="mt-4" variant="soft" :loading="socialPageLoading[provider.source]" @click="loadMoreSocial(provider.source)">Load more {{ provider.source === 'facebook' ? 'Page posts' : 'Instagram media' }}</UButton>
            </div>
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
          <UCard v-if="setup" variant="soft">
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
const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard' })

import DashboardAnalyticsRow from '~/lib/components/workspace/dashboard/AnalyticsRow.vue'
import { localDateAt, addLocalDays, formatCalendarDate } from '~/utils/timezone'
import type { ProviderInsights, ProviderContentInsight, ProviderMetric } from '~/server/utils/meta-insights'
import type { AnalyticsReport } from '~/server/utils/analytics-report'
import { currencyFractionDigits, isCurrencyCode } from '~/shared/currencies'

type PresetKey = 'last_52_weeks' | 'last_30_days' | 'last_7_days' | 'current_month' | 'custom'

interface AnalyticsResponse {
  social: { facebook: ProviderInsights; instagram: ProviderInsights }
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
  attribution: AnalyticsReport['attribution']
  outcomeAttribution: AnalyticsReport['outcomeAttribution']
  attributedValue: AnalyticsReport['attributedValue']
  conversions: AnalyticsReport['conversions']
  values: AnalyticsReport['values']
  bookingValue: AnalyticsReport['bookingValue']
  net: AnalyticsReport['net']
  signupCohort: AnalyticsReport['signupCohort']
  coverage: AnalyticsReport['coverage']
  period: { startDate: string; endDate: string; timezone: string; analyticsDataStartAt: string | null }
}

const route = useRoute()

interface InsightsReviews {
  total: number
  average: number | null
  distribution: Array<{ rating: number; count: number }>
  recent: Array<{ id: string; author: string; rating: number; title: string | null; content: string | null; createdAt: string }>
}
interface InsightsSetup {
  organizationId: string
  label: string
  completed: number
  total: number
  items: Array<{ id: string; label: string; done: boolean }>
}
interface InsightsResponse {
  organizationId: string
  report: AnalyticsResponse
  reviews: InsightsReviews
  setup: InsightsSetup
}

// Reviews and Opportunities read what we actually hold. There is no Superhost
// equivalent, and a review carries one overall rating rather than per-category
// scores, so neither is invented here.
const TAB_VALUES = ['views', 'social', 'reviews', 'opportunities', 'activity'] as const
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
  { label: 'Social', value: 'social' as const },
  { label: 'Reviews', value: 'reviews' as const },
  { label: 'Opportunities', value: 'opportunities' as const },
  // Activity is a report like the others, not a screen of its own: it reads
  // what happened and edits nothing, so it belongs beside Views and Reviews
  // rather than on an orphan route nothing linked to.
  { label: 'Activity', value: 'activity' as const },
]

const reviews = ref<InsightsResponse['reviews']>({ total: 0, average: null, distribution: [], recent: [] })
const setup = ref<InsightsSetup | null>(null)

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
const isMetric = (value: unknown): value is ProviderMetric =>
  isRecord(value) && typeof value.name === 'string' && (value.value === null || typeof value.value === 'number')
  && typeof value.unit === 'string' && typeof value.period === 'string' && typeof value.status === 'string'
  && (value.reason === null || typeof value.reason === 'string')
  && (value.previousValue === null || typeof value.previousValue === 'number')
  && (value.previousStatus === null || typeof value.previousStatus === 'string')
const isProvider = (value: unknown): value is ProviderInsights =>
  isRecord(value) && typeof value.source === 'string' && typeof value.apiVersion === 'string'
  && typeof value.status === 'string' && (value.targetId === null || typeof value.targetId === 'string')
  && (value.targetName === null || typeof value.targetName === 'string')
  && (value.connectionRevision === null || typeof value.connectionRevision === 'string')
  && (value.fetchedAt === null || typeof value.fetchedAt === 'string')
  && (value.error === null || typeof value.error === 'string')
  && typeof value.contentCoverage === 'string'
  && (value.contentCoverageReason === null || typeof value.contentCoverageReason === 'string')
  && (value.nextCursor === null || typeof value.nextCursor === 'string')
  && Array.isArray(value.metrics) && value.metrics.every(isMetric)
  && Array.isArray(value.content) && value.content.every(item => isRecord(item)
    && typeof item.id === 'string' && typeof item.kind === 'string' && typeof item.publishedAt === 'string'
    && (item.permalink === null || typeof item.permalink === 'string')
    && (item.caption === null || typeof item.caption === 'string')
    && Array.isArray(item.metrics) && item.metrics.every(isMetric))

/**
 * Every field the page reads is checked, not just the containers around them.
 * Checking only that `conversions` was an array let `[{}]` through, and the row
 * then threw on `eventName.replaceAll` while rendering; a missing metric passed
 * too and rendered as a zero through `|| 0`, which reads as real traffic of
 * none rather than as a response we should have rejected.
 */
const isAnalyticsResponse = (value: unknown): value is AnalyticsResponse =>
  isRecord(value)
  && isRecord(value.social) && isProvider(value.social.facebook) && isProvider(value.social.instagram)
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
  && value.attribution.every(row => isLabelled(row, 'source', 'sessions', 'outcomeEvents', 'convertingSessions') && typeof (row as Record<string, unknown>).medium === 'string'
    && ((row as Record<string, unknown>).sessionConversionRate === null || typeof (row as Record<string, unknown>).sessionConversionRate === 'number'))
  && Array.isArray(value.conversions)
  && value.conversions.every(row => isLabelled(row, 'eventName', 'events', 'distinctEntities', 'convertingSessions', 'nonbrowserEvents') && typeof (row as Record<string, unknown>).stage === 'string'
    && ((row as Record<string, unknown>).sessionConversionRate === null || typeof (row as Record<string, unknown>).sessionConversionRate === 'number'))
  && Array.isArray(value.outcomeAttribution)
  && value.outcomeAttribution.every(row => isLabelled(row, 'source', 'eventName', 'events', 'distinctEntities'))
  && Array.isArray(value.attributedValue)
  && value.attributedValue.every(row => isNumberField(row, 'purchases', 'collectedMinor', 'refundedMinor', 'netMinor') && isRecord(row) && isCurrencyCode(row.currency))
  && Array.isArray(value.values)
  && value.values.every(row => isLabelled(row, 'eventName', 'events', 'valueMinor') && isRecord(row) && isCurrencyCode(row.currency))
  && Array.isArray(value.bookingValue)
  && value.bookingValue.every(row => isNumberField(row, 'bookings', 'valuedBookings', 'quotedValueMinor') && isRecord(row) && (row.currency === null || isCurrencyCode(row.currency)))
  && Array.isArray(value.net)
  && value.net.every(row => isNumberField(row, 'collectedMinor', 'refundedMinor', 'netMinor') && isRecord(row) && isCurrencyCode(row.currency))
  && isRecord(value.signupCohort) && isNumberField(value.signupCohort, 'signups', 'onboardedSignups', 'firstPaidSignups', 'onboardedBusinesses', 'firstPaidBusinesses')
  && isRecord(value.coverage) && Array.isArray(value.coverage.ga4Delivery)

const isInsightsResponse = (value: unknown): value is InsightsResponse =>
  isRecord(value)
  && typeof value.organizationId === 'string'
  && isAnalyticsResponse(value.report)
  && isRecord(value.reviews)
  && typeof value.reviews.total === 'number'
  && Array.isArray(value.reviews.distribution)
  && Array.isArray(value.reviews.recent)
  && isRecord(value.setup)
  && typeof value.setup.label === 'string'
  && typeof value.setup.completed === 'number'
  && typeof value.setup.total === 'number'
  && Array.isArray(value.setup.items)

const initialRange = { ...range }
let latestManualRequestId = 0

async function fetchInsights(query: { startDate?: string; endDate?: string; facebookCursor?: string; instagramCursor?: string }) {
  return await dashboardApi<InsightsResponse>('/api/dashboard/analytics', {
    query,
    validate: isInsightsResponse,
  })
}

const { data: insightsResource, pending: analyticsPending, error: analyticsResourceError } =
  await useAsyncData(
    `dashboard-org-insights:${initialRange.startDate}:${initialRange.endDate}`,
    () => fetchInsights({}),
    { lazy: true },
  )

watch([insightsResource, analyticsPending, analyticsResourceError], ([resource, pending, error]) => {
  if (latestManualRequestId !== 0) return
  loading.value = pending
  if (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load insights'
    return
  }
  if (resource) {
    analytics.value = resource.report
    Object.assign(range, { startDate: resource.report.period.startDate, endDate: resource.report.period.endDate })
    reviews.value = resource.reviews
    setup.value = resource.setup
    loadError.value = null
  }
}, { immediate: true })

// The same native query MCP exposes (query_organization_analytics), asked for the pageviews of the
// selected range grouped by language. Every group is reachable: "Show more" follows the cursor.
const nativeLanguages = reactive({
  rows: [] as Array<{ language: string | null; pageViews: number; sessions: number }>,
  totalPageViews: 0, totalSessions: 0, cursor: null as string | null, loading: false,
  error: null as string | null, detailUnavailable: null as string | null,
})
let latestLanguageRequest = 0
async function loadLanguages(more: boolean) {
  const requestId = ++latestLanguageRequest
  const period = analytics.value?.period
  if (!period) return
  nativeLanguages.loading = true
  nativeLanguages.error = null
  try {
    const response = await dashboardApi<{
      rows: Array<{ dimensions: { locale: string | null }; metrics: { page_views: number; sessions: number } }>
      next_cursor: string | null
      totals: Record<string, { value: number | null }>
      coverage: { requested_range: { unavailable: string | null } }
    }>('/api/dashboard/analytics-query', {
      method: 'POST',
      body: {
        mode: 'breakdown', start_date: period.startDate, end_date: period.endDate, filters: { kind: 'pageview' },
        dimensions: ['locale'], metrics: ['page_views', 'sessions'], limit: 20,
        ...(more && nativeLanguages.cursor ? { cursor: nativeLanguages.cursor } : {}),
      },
      validate: (value): value is never => isRecord(value) && Array.isArray(value.rows) && isRecord(value.totals) && isRecord(value.coverage),
    })
    if (requestId !== latestLanguageRequest) return
    const rows = response.rows.map(row => ({ language: row.dimensions.locale, pageViews: row.metrics.page_views, sessions: row.metrics.sessions }))
    nativeLanguages.rows = more ? [...nativeLanguages.rows, ...rows] : rows
    nativeLanguages.cursor = response.next_cursor
    nativeLanguages.totalPageViews = response.totals.page_views?.value ?? 0
    nativeLanguages.totalSessions = response.totals.sessions?.value ?? 0
    nativeLanguages.detailUnavailable = response.coverage.requested_range.unavailable
  } catch (error) {
    if (requestId === latestLanguageRequest) nativeLanguages.error = error instanceof Error ? error.message : 'Could not load pageviews by language'
  } finally {
    if (requestId === latestLanguageRequest) nativeLanguages.loading = false
  }
}
watch(() => analytics.value ? `${analytics.value.period.startDate}:${analytics.value.period.endDate}` : null, (key) => { if (key) void loadLanguages(false) }, { immediate: true })

const dailyData = computed(() => analytics.value?.dailyData || [])
const socialProviders = computed(() => analytics.value ? [analytics.value.social.facebook, analytics.value.social.instagram] : [])
const socialPageLoading = reactive({ facebook: false, instagram: false })
const socialPageError = reactive<{ facebook: string | null; instagram: string | null }>({ facebook: null, instagram: null })
async function loadMoreSocial(source: 'facebook' | 'instagram') {
  const current = analytics.value?.social[source]
  if (!current?.nextCursor || socialPageLoading[source]) return
  const requestedRange = { startDate: range.startDate, endDate: range.endDate }
  socialPageLoading[source] = true
  socialPageError[source] = null
  try {
    const response = await fetchInsights({ ...requestedRange,
      ...(source === 'facebook' ? { facebookCursor: current.nextCursor } : { instagramCursor: current.nextCursor }) })
    const next = response.report.social[source]
    if (next.status !== 'connected') throw new Error(next.error ?? 'The social connection could not be read')
    if (next.connectionRevision !== current.connectionRevision || next.targetId !== current.targetId) throw new Error('The social connection changed. Reload insights.')
    if (!analytics.value || range.startDate !== requestedRange.startDate || range.endDate !== requestedRange.endDate
      || analytics.value.social[source] !== current) return
    analytics.value.social[source] = { ...next, content: [...current.content, ...next.content] }
  } catch (error) {
    socialPageError[source] = error instanceof Error ? error.message : 'Could not load more social posts'
  } finally {
    socialPageLoading[source] = false
  }
}
function sortedSocialContent(provider: ProviderInsights): ProviderContentInsight[] {
  return [...provider.content].sort((left, right) => {
    const views = (item: ProviderContentInsight) => item.metrics.find(metric => metric.name === (provider.source === 'facebook' ? 'post_media_view' : 'views') && metric.status === 'available')?.value
    return (views(right) ?? -1) - (views(left) ?? -1)
  })
}
function metricLabel(name: string): string { return name.replace(/^(page|post)_/, '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()) }
function formatDateTime(value: string): string { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
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
    analytics.value = response.report
    Object.assign(range, { startDate: response.report.period.startDate, endDate: response.report.period.endDate })
    reviews.value = response.reviews
    setup.value = response.setup
  } catch (error) {
    if (requestId !== latestManualRequestId) return
    loadError.value = error instanceof Error ? error.message : 'Failed to load insights'
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
