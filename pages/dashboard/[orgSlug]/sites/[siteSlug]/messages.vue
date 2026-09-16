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
      <UDashboardNavbar :title="navbarTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="navbarBackTo" :label="navbarBackLabel" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        show-desktop-detail
        flush-index
        flush-detail
        :dismiss-to="listWithFilters"
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

// One back control, the navbar's. Past conversations is the list becoming the
// other corpus, so the chrome names it and goes back to the list — a second
// arrow inside the panel would be two controls for one navigation.
const pastOnly = computed(() => route.query.archived !== undefined)

// Closing a thread returns to the list it was opened from, filters and corpus
// intact. Dropping the query here sent a member reading the archive back to
// the current list.
function listUrl(drop: string[] = []) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(route.query)) {
    if (drop.includes(key)) continue
    if (typeof value === 'string') query.set(key, value)
  }
  const search = query.toString()
  return search ? `${messagesPath.value}?${search}` : messagesPath.value
}

/** Closing a thread returns to the list it was opened from, corpus intact. */
const listWithFilters = computed(() => listUrl())
/** Leaving the archive is a level up, so back drops it and keeps the filters. */
const currentList = computed(() => listUrl(['archived']))
const navbarTitle = computed(() => pastOnly.value ? 'Past conversations' : siteName.value)
const navbarBackTo = computed(() => pastOnly.value ? currentList.value : sitePath.value)
const navbarBackLabel = computed(() => pastOnly.value ? 'Messages' : 'Site')

// The chrome names the place; the panel names itself. Stacking a navbar
// "Messages" on top of the list's own heading is the dashboard repeating what
// the panel already says.
const dashboard = useDashboardSite()
const siteName = computed(() => dashboard.site.value?.brand_name ?? 'Messages')

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
