<template>
  <UDashboardPanel id="org-today">
    <template #header>
      <UDashboardNavbar title="Today">
        <template #leading>
          <DashboardNavbarLeading :detail-to="orgBase" :detail-label="organizationName" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-default,64rem)] space-y-10 pb-24">
        <UAlert
          v-if="todayError"
          color="error"
          variant="soft"
          title="Today could not be loaded"
          :description="getErrorMessage(todayError, 'Today request failed')"
        />

        <div v-if="pending && !todayData" class="space-y-5" aria-label="Loading today">
          <USkeleton class="h-24 w-full" />
          <USkeleton v-for="index in 4" :key="index" class="h-16 w-full" />
        </div>

        <template v-else-if="todayData && !todayError">
          <nav class="grid grid-cols-2 divide-x divide-y divide-default border-y border-default sm:grid-cols-4 sm:divide-y-0" aria-label="Today's metrics">
            <NuxtLink
              v-for="metric in metrics"
              :key="metric.label"
              :to="metric.to"
              class="group px-4 py-5 first:pl-0 last:pr-0 sm:px-6"
            >
              <p class="text-2xl font-semibold text-highlighted tabular-nums">{{ metric.value }}</p>
              <p class="mt-1 text-sm text-muted group-hover:text-highlighted">{{ metric.label }}</p>
            </NuxtLink>
          </nav>

          <AgendaSection v-if="schedule.length" title="Schedule">
            <AgendaRow v-for="item in schedule" :key="item.id" :item="item" />
          </AgendaSection>

          <AgendaSection v-if="attention.length" title="Needs attention">
            <AgendaRow v-for="item in attention" :key="item.id" :item="item" />
            <template #after>
              <NuxtLink :to="`${orgBase}/inbox?state=needs_attention`" class="inline-flex items-center gap-1 text-sm font-medium text-primary">
                View all <UIcon name="i-lucide-arrow-right" class="size-4" />
              </NuxtLink>
            </template>
          </AgendaSection>

          <AgendaSection v-if="publishing.length" title="Publishing today">
            <AgendaRow v-for="item in publishing" :key="item.id" :item="item" />
          </AgendaSection>

          <div v-if="nothingToday" class="py-20 text-center">
            <UIcon name="i-lucide-sun" class="mx-auto mb-3 size-9 text-muted" />
            <p class="font-medium text-highlighted">Nothing scheduled today</p>
            <p class="mt-1 text-sm text-muted">You’re all caught up across your organization.</p>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import type { AgendaItem, AgendaKind, AgendaLocation, AgendaSite } from '~/server/utils/dashboard-agenda'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Today | KrabiClaw', robots: 'noindex, nofollow' })

interface TodayResponse {
  items: AgendaItem[]
  attention: AgendaItem[]
  counts: { reservations: number; experienceBookings: number; threadsNeedingAttention: number; posts: number }
  availableKinds: AgendaKind[]
  sites: AgendaSite[]
  locations: AgendaLocation[]
  resolvedAt: string
}

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardApi = useDashboardApi()
const requestEvent = useRequestEvent()
const orgSlug = computed(() => String(route.params.orgSlug ?? ''))
const orgBase = computed(() => `/dashboard/${encodeURIComponent(orgSlug.value)}`)
const organizationName = computed(() => dashboard.organization.value?.name ?? 'Organization')
const todayKey = computed(() => `dashboard-today-${orgSlug.value}`)

const isAgendaItem = (value: unknown): value is AgendaItem =>
  isRecord(value)
  && typeof value.id === 'string'
  && ['reservation', 'experience_booking', 'post', 'thread'].includes(String(value.kind))
  && typeof value.startsAt === 'string'
  && typeof value.dayKey === 'string'
  && typeof value.timeZone === 'string'
  && typeof value.title === 'string'
  && typeof value.status === 'string'
  && typeof value.siteId === 'string'
  && typeof value.to === 'string'

const isTodayResponse = (value: unknown): value is TodayResponse => {
  if (!isRecord(value) || !isRecord(value.counts)) return false
  const counts = value.counts
  return Array.isArray(value.items) && value.items.every(isAgendaItem)
    && Array.isArray(value.attention) && value.attention.every(isAgendaItem)
    && ['reservations', 'experienceBookings', 'threadsNeedingAttention', 'posts'].every(key => typeof counts[key] === 'number')
    && Array.isArray(value.availableKinds)
    && Array.isArray(value.sites)
    && Array.isArray(value.locations)
    && typeof value.resolvedAt === 'string'
}

const { data: todayData, pending, error: todayError } = await useAsyncData<TodayResponse>(todayKey, async () => {
  if (import.meta.server) {
    if (!requestEvent || !dashboard.organization.value) throw createError({ statusCode: 500, statusMessage: 'Dashboard context unavailable' })
    const [{ getDashboardContext }, { listAgenda, todayKeyForTimeZone }] = await Promise.all([
      import('~/server/utils/dashboard-context'), import('~/server/utils/dashboard-agenda'),
    ])
    const context = await getDashboardContext(requestEvent, { requireSite: false, organizationSlug: orgSlug.value })
    const now = new Date()
    const shift = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
    const common = {
      organizationSlug: orgSlug.value,
      principal: { memberId: context.organization.memberId, role: context.organization.role },
    }
    const [nearby, attention] = await Promise.all([
      listAgenda(context.db, context.organization.id, { from: shift(-1), to: shift(1), kinds: ['reservation', 'experience_booking', 'post'], ...common }),
      listAgenda(context.db, context.organization.id, { from: '2000-01-01', to: shift(1), kinds: ['thread'], threadState: 'needs_attention', limit: 5, ...common }),
    ])
    const items = nearby.items.filter(item => item.dayKey === todayKeyForTimeZone(now, item.timeZone))
    return {
      items, attention: [...attention.items].sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
      counts: {
        reservations: items.filter(item => item.kind === 'reservation').length,
        experienceBookings: items.filter(item => item.kind === 'experience_booking').length,
        threadsNeedingAttention: attention.items.length,
        posts: items.filter(item => item.kind === 'post').length,
      },
      availableKinds: nearby.availableKinds, sites: nearby.sites, locations: nearby.locations, resolvedAt: now.toISOString(),
    }
  }
  return await dashboardApi<TodayResponse>('/api/dashboard/today', { validate: isTodayResponse })
})

const availableKinds = computed(() => new Set(todayData.value?.availableKinds ?? []))
const metrics = computed(() => {
  if (!todayData.value) return []
  return [
    ...(availableKinds.value.has('reservation') ? [{ label: 'Reservations', value: todayData.value.counts.reservations, to: `${orgBase.value}/calendar?kinds=reservation` }] : []),
    ...(availableKinds.value.has('experience_booking') ? [{ label: 'Experience bookings', value: todayData.value.counts.experienceBookings, to: `${orgBase.value}/calendar?kinds=experience_booking` }] : []),
    { label: 'Needs attention', value: todayData.value.counts.threadsNeedingAttention, to: `${orgBase.value}/inbox?state=needs_attention` },
    { label: 'Publishing', value: todayData.value.counts.posts, to: `${orgBase.value}/calendar?kinds=post` },
  ]
})
const schedule = computed(() => (todayData.value?.items ?? []).filter(item => item.kind === 'reservation' || item.kind === 'experience_booking'))
const attention = computed(() => todayData.value?.attention ?? [])
const publishing = computed(() => (todayData.value?.items ?? []).filter(item => item.kind === 'post'))
const nothingToday = computed(() => schedule.value.length === 0 && attention.value.length === 0 && publishing.value.length === 0)
</script>
