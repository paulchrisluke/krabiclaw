<template>
  <UDashboardPanel id="org-calendar">
    <template #header>
      <UDashboardNavbar title="Calendar">
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[var(--ws-page-wide,90rem)] space-y-6 pb-24">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="space-y-3">
            <div class="flex items-center gap-1">
              <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" square aria-label="Previous month" @click="moveMonth(-1)" />
              <UButton label="Today" color="neutral" variant="soft" @click="goToday" />
              <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" square aria-label="Next month" @click="moveMonth(1)" />
              <h2 class="ml-3 text-lg font-semibold text-highlighted">{{ monthLabel }}</h2>
            </div>
            <div class="flex gap-2" aria-label="Calendar view">
              <UButton
                label="Agenda"
                :variant="calendarView === 'agenda' ? 'solid' : 'soft'"
                :color="calendarView === 'agenda' ? 'primary' : 'neutral'"
                @click="calendarView = 'agenda'"
              />
              <UButton
                label="Availability"
                :variant="calendarView === 'availability' ? 'solid' : 'soft'"
                :color="calendarView === 'availability' ? 'primary' : 'neutral'"
                @click="calendarView = 'availability'"
              />
            </div>
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[38rem]">
            <UFormField label="Site">
              <USelect v-model="filters.siteId" :items="siteOptions" class="w-full" />
            </UFormField>
            <UFormField label="Location">
              <USelect v-model="filters.locationId" :items="locationOptions" :disabled="filters.siteId === FILTER_ALL" class="w-full" />
            </UFormField>
            <UFormField v-if="calendarView === 'agenda'" label="Kind">
              <USelect v-model="filters.kind" :items="kindOptions" class="w-full" />
            </UFormField>
          </div>
        </div>

        <template v-if="calendarView === 'availability'">
          <UAlert
            v-if="filters.siteId === FILTER_ALL || filters.locationId === FILTER_ALL"
            color="neutral"
            variant="soft"
            title="Choose a site and location"
            description="Availability is managed for one location at a time."
          />
          <DashboardAvailabilityCalendar
            v-else
            :site-id="filters.siteId"
            :location-id="filters.locationId"
            :from="monthStart"
            :to="monthEnd"
            :owner-type="availabilityOwnerType"
            :owner-id="availabilityOwnerId"
          />
        </template>

        <template v-else>
          <UAlert
            v-if="agendaError"
            color="error"
            variant="soft"
            title="Calendar could not be loaded"
            :description="getErrorMessage(agendaError, 'Calendar request failed')"
          />
          <USkeleton v-if="loading && !agendaData" class="h-[38rem] w-full" />

          <template v-else-if="agendaData && !agendaError">
          <div data-testid="calendar-month-grid" class="hidden overflow-hidden rounded-lg border border-default lg:block">
            <div class="grid grid-cols-7 border-b border-default bg-muted/30">
              <div v-for="day in weekdayLabels" :key="day" class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{{ day }}</div>
            </div>
            <div class="grid grid-cols-7">
              <a
                v-for="cell in monthCells"
                :key="cell.dayKey"
                href="#calendar-day-list"
                class="min-h-32 border-b border-r border-default p-2 text-left last:border-r-0"
                :class="cell.inMonth ? 'bg-default' : 'bg-muted/20 text-dimmed'"
                @click="selectedDay = cell.dayKey"
              >
                <span class="inline-flex size-7 items-center justify-center rounded-full text-xs font-medium" :class="cell.isToday ? 'bg-primary text-inverted' : ''">{{ cell.day }}</span>
                <ul class="mt-1 space-y-1">
                  <li v-for="item in cell.items.slice(0, 3)" :key="item.id" class="flex min-w-0 items-center gap-1 rounded px-1.5 py-1 text-[11px]" :class="kindStyle(item.kind)">
                    <UIcon :name="kindIcon(item.kind)" class="size-3 shrink-0" />
                    <span class="truncate">{{ kindLabel(item.kind) }} · {{ item.title }}</span>
                  </li>
                  <li v-if="cell.items.length > 3" class="px-1.5 text-[11px] font-medium text-muted">+{{ cell.items.length - 3 }} more</li>
                </ul>
              </a>
            </div>
          </div>

          <section v-if="selectedDayItems.length" id="calendar-day-list" class="hidden scroll-mt-20 space-y-2 lg:block">
            <h3 class="text-sm font-semibold text-highlighted">{{ dayLabel(selectedDay) }}</h3>
            <div class="divide-y divide-default border-y border-default">
              <AgendaRow v-for="item in selectedDayItems" :key="item.id" :item="item" />
            </div>
          </section>

          <div data-testid="calendar-mobile-list" class="space-y-8 lg:hidden">
            <section v-for="group in mobileGroups" :id="`day-${group.dayKey}`" :key="group.dayKey" class="scroll-mt-20 space-y-2">
              <h3 class="text-sm font-semibold text-highlighted">{{ dayLabel(group.dayKey) }}</h3>
              <div class="divide-y divide-default border-y border-default">
                <AgendaRow v-for="item in group.items" :key="item.id" :item="item" />
              </div>
            </section>
          </div>

          <div v-if="agendaData.items.length === 0" class="py-20 text-center">
            <UIcon name="i-lucide-calendar-days" class="mx-auto mb-3 size-9 text-muted" />
            <p class="font-medium text-highlighted">Nothing scheduled this month</p>
            <p class="mt-1 text-sm text-muted">Try another month or adjust the filters.</p>
          </div>
          </template>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardAvailabilityCalendar from '~/components/dashboard/AvailabilityCalendar.vue'
import { getErrorMessage } from '~/utils/errors'
import type { AgendaItem, AgendaKind, AgendaLocation, AgendaPayload, AgendaSite } from '~/server/utils/dashboard-agenda'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Calendar | KrabiClaw', robots: 'noindex, nofollow' })

const FILTER_ALL = '__all__'
const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const requestEvent = useRequestEvent()
const orgSlug = computed(() => String(route.params.orgSlug ?? ''))
const currentMonth = ref(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)))
const routeKind = typeof route.query.kinds === 'string' && ['reservation', 'experience_booking', 'post'].includes(route.query.kinds) ? route.query.kinds : FILTER_ALL
const routeSiteId = typeof route.query.siteId === 'string' ? route.query.siteId : FILTER_ALL
const routeLocationId = typeof route.query.locationId === 'string' ? route.query.locationId : FILTER_ALL
const calendarView = ref(route.query.view === 'availability' ? 'availability' : 'agenda')
const filters = reactive({ siteId: routeSiteId, locationId: routeLocationId, kind: routeKind })
const agendaData = ref<AgendaPayload | null>(null)
const agendaError = ref<unknown>(null)
const loading = ref(false)
// The viewer's own date, not UTC. toISOString() is a day behind for anyone east
// of Greenwich in the evening, which made the calendar open on yesterday and
// ask the availability API about the wrong date.
function localDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const selectedDay = ref(localDayKey())

const monthStart = computed(() => currentMonth.value.toISOString().slice(0, 10))
const monthEnd = computed(() => new Date(Date.UTC(currentMonth.value.getUTCFullYear(), currentMonth.value.getUTCMonth() + 1, 0)).toISOString().slice(0, 10))
const monthLabel = computed(() => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(currentMonth.value))
const query = computed(() => ({
  from: monthStart.value, to: monthEnd.value,
  siteId: filters.siteId !== FILTER_ALL ? filters.siteId : undefined,
  locationId: filters.locationId !== FILTER_ALL ? filters.locationId : undefined,
  kinds: filters.kind !== FILTER_ALL ? [filters.kind as AgendaKind] : undefined,
}))
const requestKey = computed(() => `dashboard-calendar-${orgSlug.value}-${JSON.stringify(query.value)}`)
const availabilityOwnerType = computed(() => route.query.ownerType === 'location' || route.query.ownerType === 'experience' ? route.query.ownerType : undefined)
const availabilityOwnerId = computed(() => typeof route.query.ownerId === 'string' ? route.query.ownerId : undefined)

const isAgendaItem = (value: unknown): value is AgendaItem =>
  isRecord(value) && typeof value.id === 'string' && typeof value.kind === 'string'
  && typeof value.startsAt === 'string' && typeof value.dayKey === 'string'
  && typeof value.timeZone === 'string' && typeof value.title === 'string'
  && typeof value.status === 'string' && typeof value.siteId === 'string' && typeof value.to === 'string'
const isSite = (value: unknown): value is AgendaSite => isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string' && typeof value.slug === 'string'
const isLocation = (value: unknown): value is AgendaLocation => isRecord(value) && typeof value.id === 'string' && typeof value.siteId === 'string' && typeof value.title === 'string'
const isAgendaPayload = (value: unknown): value is AgendaPayload =>
  isRecord(value) && Array.isArray(value.items) && value.items.every(isAgendaItem)
  && Array.isArray(value.availableKinds) && value.availableKinds.every(kind => ['reservation', 'experience_booking', 'post'].includes(String(kind)))
  && Array.isArray(value.sites) && value.sites.every(isSite)
  && Array.isArray(value.locations) && value.locations.every(isLocation)

async function fetchAgenda(): Promise<AgendaPayload> {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Dashboard context unavailable' })
    const [{ getDashboardContext }, { listAgenda }] = await Promise.all([
      import('~/server/utils/dashboard-context'), import('~/server/utils/dashboard-agenda'),
    ])
    const context = await getDashboardContext(requestEvent, { requireSite: false, organizationSlug: orgSlug.value })
    return await listAgenda(context.db, context.organization.id, {
      ...query.value, organizationSlug: orgSlug.value,
      principal: { env: context.env, memberId: context.organization.memberId, role: context.organization.role },
    })
  }
  return await dashboardApi<AgendaPayload>('/api/dashboard/agenda', {
    query: { ...query.value, kinds: query.value.kinds?.join(',') }, validate: isAgendaPayload,
  })
}

const { data: initialData, error: initialError } = await useAsyncData(requestKey, fetchAgenda)
agendaData.value = initialData.value ?? null
agendaError.value = initialError.value

watch(requestKey, async (key) => {
  const requestedKey = key
  loading.value = true
  agendaError.value = null
  try {
    const result = await fetchAgenda()
    if (requestedKey !== requestKey.value) return
    agendaData.value = result
  } catch (error) {
    if (requestedKey !== requestKey.value) return
    agendaError.value = error
  } finally {
    if (requestedKey === requestKey.value) loading.value = false
  }
})

watch(() => filters.siteId, (_, previousSiteId) => {
  if (previousSiteId !== undefined) filters.locationId = FILTER_ALL
})
watch([() => filters.siteId, () => filters.locationId, calendarView], ([siteId, locationId, view]) => {
  void router.replace({
    query: {
      ...route.query,
      view: view === 'availability' ? view : undefined,
      siteId: siteId === FILTER_ALL ? undefined : siteId,
      locationId: locationId === FILTER_ALL ? undefined : locationId,
      ownerType: undefined,
      ownerId: undefined,
    },
  })
})
watch(() => filters.kind, async kind => {
  await router.replace({ query: { ...route.query, kinds: kind === FILTER_ALL ? undefined : kind } })
})

const siteOptions = computed(() => [{ label: 'All sites', value: FILTER_ALL }, ...(agendaData.value?.sites ?? []).map(site => ({ label: site.label, value: site.id }))])
const locationOptions = computed(() => [{ label: 'All locations', value: FILTER_ALL }, ...(agendaData.value?.locations ?? []).filter(location => location.siteId === filters.siteId).map(location => ({ label: location.title, value: location.id }))])
const kindOptions = computed(() => [{ label: 'All kinds', value: FILTER_ALL }, ...(agendaData.value?.availableKinds ?? []).map(kind => ({ label: kindLabel(kind), value: kind }))])
const itemsByDay = computed(() => {
  const groups = new Map<string, AgendaItem[]>()
  for (const item of agendaData.value?.items ?? []) groups.set(item.dayKey, [...(groups.get(item.dayKey) ?? []), item])
  return groups
})
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthCells = computed(() => {
  const year = currentMonth.value.getUTCFullYear()
  const month = currentMonth.value.getUTCMonth()
  const firstWeekday = currentMonth.value.getUTCDay()
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, index - firstWeekday + 1))
    const dayKey = date.toISOString().slice(0, 10)
    return { dayKey, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month, isToday: dayKey === localDayKey(), items: itemsByDay.value.get(dayKey) ?? [] }
  })
})
const mobileGroups = computed(() => [...itemsByDay.value.entries()].map(([dayKey, items]) => ({ dayKey, items })))
const selectedDayItems = computed(() => itemsByDay.value.get(selectedDay.value) ?? [])

function moveMonth(offset: number) {
  currentMonth.value = new Date(Date.UTC(currentMonth.value.getUTCFullYear(), currentMonth.value.getUTCMonth() + offset, 1))
}
function goToday() {
  const now = new Date()
  currentMonth.value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
function dayLabel(dayKey: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${dayKey}T12:00:00Z`))
}
function kindLabel(kind: AgendaKind) {
  return ({ reservation: 'Reservation', experience_booking: 'Experience booking', post: 'Post' })[kind]
}
function kindIcon(kind: AgendaKind) {
  return ({ reservation: 'i-lucide-utensils', experience_booking: 'i-lucide-ticket', post: 'i-lucide-send' })[kind]
}
function kindStyle(kind: AgendaKind) {
  return ({ reservation: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', experience_booking: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', post: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' })[kind]
}
</script>
