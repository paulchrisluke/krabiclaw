<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A thread is open: the list is the index column, the conversation the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="location-messages">
    <template #header>
      <UDashboardNavbar title="Messages" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="locationPath" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        has-detail
        :dismiss-to="messagesPath"
        detail-title="Conversation"
        wide-detail
        hide-detail-heading
      >
        <template #index>
          <GuestThreadList scope="location" />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <GuestThreadList v-else scope="location" />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const messagesPath = computed(() => `${locationPath.value}/messages`)
const frame = useEditorFrame(messagesPath)

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
