<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    Messages is a screen, not a section of the site hub: the list is the left
    column and the conversation is the right one, the way every mail client and
    Airbnb's own inbox reads. The right column is there whether or not a thread
    is open — an empty conversation pane says "pick one", where a full-width
    list followed by a jump to a full-width conversation says nothing.
  -->
  <UDashboardPanel v-else id="site-messages">
    <template #header>
      <UDashboardNavbar :title="siteName" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="sitePath" label="Site" />
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
          <GuestThreadList scope="site" />
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

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const messagesPath = computed(() => `${sitePath.value}/messages`)
const frame = useEditorFrame(messagesPath)

// The chrome names the place; the panel names itself. Stacking a navbar
// "Messages" on top of the list's own heading is the dashboard repeating what
// the panel already says.
const dashboard = useDashboardSite()
const siteName = computed(() => dashboard.site.value?.brand_name ?? 'Messages')

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
