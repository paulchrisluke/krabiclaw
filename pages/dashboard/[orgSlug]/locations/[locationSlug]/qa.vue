<template>
  <DashboardIndexPanel id="location-qa" title="Reviews and Q&A">
    <UTabs v-model="tab" :items="tabs" class="w-full">
      <template #qa>
        <QaList :location-id="locationId" class="mt-4" />
      </template>
      <template #reviews>
        <TestimonialList :location-id="locationId" class="mt-4" />
      </template>
    </UTabs>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import QaList from '~/components/dashboard/QaList.vue'
import TestimonialList from '~/components/dashboard/TestimonialList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

const dashboardLocation = useDashboardLocation()
// Reactive: Nuxt reuses this component when only the location slug changes.
// The location its Q&A belongs to. `[locationSlug].vue` raises the 404 for a
// slug that names none, so this level is only reached through a real one.
const locationId = computed(() => dashboardLocation.currentLocationId.value ?? '')

const tabs = [
  { label: 'Q&A', slot: 'qa' as const, value: 'qa' },
  { label: 'Reviews', slot: 'reviews' as const, value: 'reviews' },
]
// The open tab lives in the URL. A review is a level below this one, so while
// one is open the tab is Reviews, and Back from it — which leads here, with no
// query of its own — puts `tab=reviews` back rather than landing on Q&A.
const router = useRouter()
const level = useRouteLevel()
const reviewsTab = useState(`qa-reviews-tab-${String(route.params.orgSlug)}-${String(route.params.locationSlug ?? '')}`, () => false)
const tab = computed({
  get: () => (route.query.tab === 'reviews' || route.params.reviewId ? 'reviews' : 'qa'),
  set: (value: string | number) => {
    reviewsTab.value = value === 'reviews'
    void router.replace({ query: { ...route.query, tab: value === 'reviews' ? 'reviews' : undefined } })
  },
})
watch([() => route.params.reviewId, () => route.params.qaId, level.mode], ([reviewId, qaId, mode]) => {
  if (reviewId) reviewsTab.value = true
  else if (qaId) reviewsTab.value = false
  else if (mode === 'index' && reviewsTab.value && route.query.tab === undefined) void router.replace({ query: { ...route.query, tab: 'reviews' } })
}, { immediate: true })

useSeoMeta({ title: 'Reviews and Q&A | KrabiClaw', robots: 'noindex, nofollow' })
</script>
