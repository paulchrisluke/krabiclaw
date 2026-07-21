<template>
  <UDashboardPanel id="location-analytics">
    <template #header>
      <UDashboardNavbar title="Analytics">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="loading" @click="loadAnalytics">
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <p class="text-sm text-muted">{{ rangeLabel }}</p>

        <UCard variant="soft">
          <div class="grid gap-4 lg:grid-cols-[13rem_1fr]">
            <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <UButton
                v-for="preset in presets"
                :key="preset.key"
                :label="preset.label"
                :variant="activePreset === preset.key ? 'soft' : 'ghost'"
                :color="activePreset === preset.key ? 'primary' : 'neutral'"
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

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

import DashboardAnalyticsRow from '~/components/workspace/dashboard/AnalyticsRow.vue'

type PresetKey = 'last_52_weeks' | 'last_30_days' | 'last_7_days' | 'current_month' | 'custom'

interface AnalyticsResponse {
  metrics: {
    pageViews: number
    uniqueSessions: number
    uniqueVisitors: number
    avgSessionDuration: number
    pagesPerSession: number
    returningVisitors: number
    changePercent: number
  }
  dailyData: Array<{ date: string; pageViews: number; sessions: number; avgDuration: number }>
  topPages: Array<{ path: string; views: number; percentOfTotal: number }>
  countries: Array<{ country: string; countryCode: string; views: number; visitors: number; percentOfTotal: number }>
  cities: Array<{ city: string; region: string | null; countryCode: string; views: number }>
  referrers: Array<{ source: string; views: number; percentOfTotal: number }>
  devices: Array<{ type: string; views: number; percentOfTotal: number }>
  period: { startDate: string; endDate: string }
}

const toast = useToast()
const dashboard = useDashboardSite()
if (!dashboard.state.value) await dashboard.refresh()
const siteId = await useDashboardSiteId()

const presets: Array<{ key: PresetKey; label: string }> = [
  { key: 'last_52_weeks', label: 'Last 52 weeks' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'current_month', label: 'Current month' }
]

const activePreset = ref<PresetKey>('last_30_days')
const loading = ref(true)
const analytics = ref<AnalyticsResponse | null>(null)
const range = reactive(presetRange('last_30_days'))

const dailyData = computed(() => analytics.value?.dailyData || [])
const maxTrendValue = computed(() => Math.max(1, ...dailyData.value.map(day => Math.max(day.pageViews, day.sessions))))
const pageviewPoints = computed(() => toPoints(dailyData.value.map(day => day.pageViews)))
const sessionPoints = computed(() => toPoints(dailyData.value.map(day => day.sessions)))
const pageviewDots = computed(() => toDots(dailyData.value.map(day => day.pageViews)))
const rangeLabel = computed(() => `${formatDate(range.startDate)} to ${formatDate(range.endDate)}`)

const metricCards = computed(() => {
  const metrics = analytics.value?.metrics
  return [
    { label: 'Pageviews', value: formatCount(metrics?.pageViews || 0), detail: `${formatSigned(metrics?.changePercent || 0)} vs previous period`, icon: 'i-lucide-chart-bar' },
    { label: 'Unique visitors', value: formatCount(metrics?.uniqueVisitors || 0), detail: `${formatCount(metrics?.returningVisitors || 0)} returning`, icon: 'i-lucide-users' },
    { label: 'Sessions', value: formatCount(metrics?.uniqueSessions || 0), detail: `${formatNumber(metrics?.pagesPerSession || 0)} pages per session`, icon: 'i-lucide-mouse-pointer-click' },
    { label: 'Avg. duration', value: formatDuration(metrics?.avgSessionDuration || 0), detail: 'Average session time', icon: 'i-lucide-clock' }
  ]
})

function getDateString(date: Date): string {
  const [day] = date.toISOString().split('T')
  return day || ''
}

function presetRange(key: PresetKey): { startDate: string; endDate: string } {
  const now = new Date()
  const endDate = getDateString(now)
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (key === 'last_52_weeks') start.setUTCDate(start.getUTCDate() - 363)
  if (key === 'last_30_days') start.setUTCDate(start.getUTCDate() - 29)
  if (key === 'last_7_days') start.setUTCDate(start.getUTCDate() - 6)
  if (key === 'current_month') start.setUTCDate(1)
  return { startDate: getDateString(start), endDate }
}

function applyPreset(key: PresetKey) {
  activePreset.value = key
  Object.assign(range, presetRange(key))
  loadAnalytics()
}

function markCustomAndLoad() {
  activePreset.value = 'custom'
  loadAnalytics()
}

async function loadAnalytics() {
  loading.value = true
  try {
    analytics.value = await $fetch<AnalyticsResponse>(`/api/sites/${siteId}/analytics`, {
      query: { startDate: range.startDate, endDate: range.endDate }
    })
  } catch (error) {
    analytics.value = null
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load analytics', color: 'error' })
  } finally {
    loading.value = false
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
  const date = new Date(`${value}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)
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

onMounted(() => {
  loadAnalytics()
})

useSeoMeta({ title: 'Analytics | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
