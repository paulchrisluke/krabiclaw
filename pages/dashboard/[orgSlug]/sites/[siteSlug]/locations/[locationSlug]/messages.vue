<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    Messages is a screen, not a section of the location hub: the list is the
    left column and the conversation is the right one, the way every mail
    client and Airbnb's own inbox reads. The right column is there whether or
    not a thread is open.
  -->
  <UDashboardPanel v-else id="location-messages">
    <template #header>
      <UDashboardNavbar :title="locationName" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="locationPath" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        show-desktop-detail
        flush-index
        flush-detail
        :dismiss-to="messagesPath"
        detail-title="Conversation"
        hide-detail-heading
      >
        <template #index>
          <GuestThreadList scope="location" />
        </template>
        <template #detail>
          <NuxtPage v-if="frame.mode.value === 'pair'" />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard', ownsChrome: true })

const route = useRoute()

const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const messagesPath = computed(() => `${locationPath.value}/messages`)
const frame = useEditorFrame(messagesPath)

// The chrome names the place; the panel names itself.
const dashboard = useDashboardSite()
const locationName = computed(() => dashboard.locations.value
  .find(candidate => candidate.slug === String(route.params.locationSlug))?.title ?? 'Messages')

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
