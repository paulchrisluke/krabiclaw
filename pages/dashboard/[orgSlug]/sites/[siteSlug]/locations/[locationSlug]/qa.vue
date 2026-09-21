<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A question is open: the list is the index column, the record the detail. -->
  <template v-else>
    <UDashboardPanel
      id="location-qa"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="hasDetail ? 32 : undefined"
    >
      <template #header>
        <UDashboardNavbar title="Reviews and Q&A" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <UTabs v-model="tab" :items="tabs" class="w-full">
            <template #qa>
              <QaList :location-id="locationId" class="mt-4" />
            </template>
            <template #reviews>
              <TestimonialList :location-id="locationId" class="mt-4" />
            </template>
          </UTabs>
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import QaList from '~/components/dashboard/QaList.vue'
import TestimonialList from '~/components/dashboard/TestimonialList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const qaPath = computed(() => `${locationPath.value}/qa`)
const frame = useEditorFrame(qaPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

const dashboardLocation = useDashboardLocation()
// Reactive: Nuxt reuses this component when only the location slug changes.
const locationId = computed(() => {
  const id = dashboardLocation.currentLocationId.value
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  return id
})

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
