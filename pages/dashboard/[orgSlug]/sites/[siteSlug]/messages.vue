<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!-- A thread is open: the list is the index column, the conversation the detail. -->
  <UDashboardPanel v-else-if="frame.mode.value === 'pair'" id="site-messages">
    <template #header>
      <UDashboardNavbar title="Messages" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sitePath" label="Site" />
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
          <GuestThreadList scope="site" />
        </template>
        <template #detail>
          <NuxtPage />
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

  <GuestThreadList v-else scope="site" />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const messagesPath = computed(() => `${sitePath.value}/messages`)
const frame = useEditorFrame(messagesPath)

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
