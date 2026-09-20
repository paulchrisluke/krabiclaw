<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    Messages is a screen, not a section of the location hub: the list is the
    left column and the conversation is the right one, the way every mail
    client and Airbnb's own inbox reads. The right column is there whether or
    not a thread is open.
  -->
  <template v-else>
    <!--
      A list panel is not a form: its rows run to the edge of the column, so
      both panels drop the body padding rather than a wrapper doing it for them.
    -->
    <UDashboardPanel
      id="location-messages"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="32"
      :ui="{ body: 'p-0 sm:p-0 gap-0' }"
    >
      <template #header>
        <UDashboardNavbar :title="navbarTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="navbarBackTo" :label="navbarBackLabel" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <GuestThreadList scope="location" />
      </template>
    </UDashboardPanel>

    <UDashboardPanel
      id="location-messages-thread"
      :class="hasDetail ? undefined : 'hidden lg:flex'"
      :ui="{ body: 'p-0 sm:p-0 gap-0' }"
    >
      <template v-if="hasDetail" #header>
        <UDashboardNavbar title="Conversation" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading :to="listWithFilters" label="Messages" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <NuxtPage v-if="hasDetail" />
      </template>
    </UDashboardPanel>
  </template>
</template>

<script setup lang="ts">
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard', ownsChrome: true })

const route = useRoute()

const locationPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}`)
const messagesPath = computed(() => `${locationPath.value}/messages`)
const frame = useEditorFrame(messagesPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

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
const navbarTitle = computed(() => pastOnly.value ? 'Past conversations' : locationName.value)
const navbarBackTo = computed(() => pastOnly.value ? currentList.value : locationPath.value)
const navbarBackLabel = computed(() => pastOnly.value ? 'Messages' : 'Location')

// The chrome names the place; the panel names itself.
const dashboard = useDashboardSite()
const locationName = computed(() => dashboard.locations.value
  .find(candidate => candidate.slug === String(route.params.locationSlug))?.title ?? 'Messages')

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
