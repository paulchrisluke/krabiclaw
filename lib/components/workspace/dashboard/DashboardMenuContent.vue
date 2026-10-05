<template>
  <div class="space-y-6">

    <!--
      Airbnb's hosting Menu leads with two square cards — Earnings and Insights,
      each a title, a subline and one figure. The account's Menu carries Past
      activity the same way, as its profile carries Past trips.
    -->
    <div v-if="cards.length" class="grid grid-cols-2 gap-4">
      <NuxtLink
        v-for="card in cards"
        :key="card.testId"
        :to="card.to"
        class="flex aspect-square flex-col rounded-2xl border border-default bg-elevated p-5 transition-colors hover:bg-accented"
        :data-testid="card.testId"
      >
        <p class="text-[15px] font-semibold text-highlighted">{{ card.label }}</p>
        <p class="mt-1 text-sm text-muted">{{ card.subline }}</p>
        <p v-if="card.figure" class="mt-auto text-4xl font-semibold tracking-tight text-highlighted">{{ card.figure }}</p>
        <!-- Airbnb stacks the listings' photos in the card's corner; the business's places, or the account's past visits. -->
        <span v-else-if="card.photos.length" class="mt-auto flex items-center">
          <img v-for="(photo, index) in card.photos.slice(0, 3)" :key="photo" :src="photo" alt="" class="size-12 rounded-xl border-2 border-elevated object-cover" :class="index ? '-ml-3' : ''">
          <span v-if="card.photos.length > 3" class="-ml-3 flex size-12 items-center justify-center rounded-xl border-2 border-elevated bg-default text-sm font-semibold text-highlighted">+{{ card.photos.length - 3 }}</span>
        </span>
        <UIcon v-else :name="card.icon" class="mt-auto size-7 text-muted" />
      </NuxtLink>
    </div>

    <EditorNavigationList :groups="groups" :active-item="activeItem" @act="onAct" />
  </div>
</template>

<script setup lang="ts">
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import { earningsFigure, isEarningsSummary, type EarningsSummary } from '~/shared/earnings-display'
import { formatCalendarDate } from '~/utils/timezone'
import { isAccountActivityResponse, type AccountActivityResponse } from '~/shared/account-activity'

// Rendered by both the desktop slideover and the mobile menu page, off one
// model, so the two surfaces cannot show different menus.
const { groups, activeItem, scopeModel, logOut, personal } = useDashboardMenu()
const { orgPaths } = useDashboardOrganizationLinks()
const dashboardApi = useDashboardApi()

const business = computed(() => orgPaths.value.org !== '/dashboard' && !personal.value)
const monthLabel = formatCalendarDate(new Date().toISOString().slice(0, 10), 'en', { month: 'long', year: 'numeric' })
// The Earnings figure is this month's money, read the way the Earnings level reads it.
const { data: earnings } = await useAsyncData(
  () => `menu-earnings:${orgPaths.value.org}`,
  async () => {
    if (!business.value) return null
    const now = new Date()
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    return await dashboardApi<EarningsSummary>('/api/dashboard/payments', { query: { view: 'overview', from, to }, validate: isEarningsSummary })
  },
  { lazy: true, server: false, watch: [business] },
)
// The pictures in the cards' corners: the business's places, or the visits the account has made.
type LocationPhotos = { success: true; locations: Array<{ id: string; imageUrl: string | null }> }
const isLocationPhotos = (value: unknown): value is LocationPhotos => isRecord(value) && value.success === true && Array.isArray(value.locations) && value.locations.every(row => isRecord(row) && typeof row.id === 'string' && (row.imageUrl === null || typeof row.imageUrl === 'string'))
const { data: places } = await useAsyncData(
  () => `menu-places:${orgPaths.value.org}`,
  async () => business.value ? await dashboardApi<LocationPhotos>('/api/dashboard/locations', { validate: isLocationPhotos }) : null,
  { lazy: true, server: false, watch: [business] },
)
const { data: activity } = await useAsyncData(
  () => `menu-activity:${personal.value}`,
  async () => personal.value ? await applicationFetch<AccountActivityResponse>('/api/account', { validate: isAccountActivityResponse }) : null,
  { lazy: true, server: false, watch: [personal] },
)
const placePhotos = computed(() => (places.value?.locations ?? []).map(row => row.imageUrl).filter((url): url is string => !!url))
const visitPhotos = computed(() => (activity.value?.activities ?? []).filter(item => item.imageUrl && (item.status === 'cancelled' || (item.endsAt && Date.parse(item.endsAt) < Date.now()) || item.kind === 'order' || item.kind === 'payment')).map(item => item.imageUrl as string))
const cards = computed(() => personal.value
  ? [
      { to: '/dashboard/account/activity', label: 'Past activity', subline: 'Visits and purchases', icon: 'i-lucide-history', figure: '', photos: visitPhotos.value, testId: 'dashboard-menu-past-activity' },
      { to: '/dashboard/account/profile/payments', label: 'Payments', subline: 'Saved payment methods', icon: 'i-lucide-credit-card', figure: '', photos: [] as string[], testId: 'dashboard-menu-payments' },
    ]
  : business.value
    ? [
        { to: `${orgPaths.value.org}/earnings`, label: 'Earnings', subline: monthLabel, icon: 'i-lucide-banknote', figure: earningsFigure(earnings.value), photos: [] as string[], testId: 'dashboard-menu-earnings' },
        { to: `${orgPaths.value.settings}/insights`, label: 'Insights', subline: 'Views and reviews', icon: 'i-lucide-chart-no-axes-column', figure: '', photos: placePhotos.value, testId: 'dashboard-menu-insights' },
      ]
    : [])

// Airbnb's "Switch to hosting" / "Switch to travelling" is a row above Log out, not a picker.
function onAct(id: string) {
  if (id === 'log-out') void logOut()
  if (id === 'switch-personal') scopeModel.value?.peers.find(peer => peer.label === 'Personal')?.onSelect?.()
  if (id === 'switch-business') scopeModel.value?.peers.find(peer => peer.label !== 'Personal')?.onSelect?.()
}


</script>
