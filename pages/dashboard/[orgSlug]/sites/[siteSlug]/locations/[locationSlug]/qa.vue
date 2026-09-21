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
// The open tab lives in the URL, so a review notification can land on Reviews.
const router = useRouter()
const tab = computed({
  get: () => (route.query.tab === 'reviews' ? 'reviews' : 'qa'),
  set: (value: string | number) => { void router.replace({ query: { ...route.query, tab: value === 'reviews' ? 'reviews' : undefined } }) },
})

useSeoMeta({ title: 'Reviews and Q&A | KrabiClaw', robots: 'noindex, nofollow' })
</script>
