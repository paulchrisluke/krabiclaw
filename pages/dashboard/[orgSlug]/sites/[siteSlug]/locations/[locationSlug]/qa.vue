<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A question is open: the list is the index column, the record the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-qa">
    <template #header>
      <UDashboardNavbar title="Q&A" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="locationPath" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="qaPath"
        detail-title="Question"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <QaList :location-id="locationId" />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <QaList v-else :location-id="locationId" />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import QaList from '~/components/dashboard/QaList.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.qa' })

const route = useRoute()
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const qaPath = computed(() => `${locationPath.value}/qa`)
const frame = useEditorFrame(qaPath)

const dashboardLocation = useDashboardLocation()
// Reactive: Nuxt reuses this component when only the location slug changes.
const locationId = computed(() => {
  const id = dashboardLocation.currentLocationId.value
  if (!id) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
  return id
})

useSeoMeta({ title: 'Q&A | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
