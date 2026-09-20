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
        <UDashboardNavbar title="Q&A" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="locationPath" label="Location" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full" :class="hasDetail ? 'max-w-xl' : 'max-w-3xl'">
          <QaList :location-id="locationId" />
        </div>
      </template>
    </UDashboardPanel>

    <!-- The open child owns the other column, header and all. -->
    <NuxtPage v-if="hasDetail" />
  </template>

</template>

<script setup lang="ts">
import QaList from '~/components/dashboard/QaList.vue'

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

useSeoMeta({ title: 'Q&A | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
