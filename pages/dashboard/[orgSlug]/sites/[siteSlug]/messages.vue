<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <!--
    Messages is a screen, not a section of the site hub: the list is the left
    column and the conversation is the right one, the way every mail client and
    Airbnb's own inbox reads. The right column is there whether or not a thread
    is open — an empty conversation pane says "pick one", where a full-width
    list followed by a jump to a full-width conversation says nothing.
  -->
  <template v-else>
    <!--
      A list panel is not a form: its rows run to the edge of the column, so
      both panels drop the body padding rather than a wrapper doing it for them.
    -->
    <UDashboardPanel
      id="site-messages"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="32"
      :ui="{ body: 'p-0 sm:p-0 gap-0' }"
    >
      <template #header>
        <UDashboardNavbar :title="navbarTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <GuestThreadList scope="site" />
      </template>
    </UDashboardPanel>

    <UDashboardPanel
      id="site-messages-thread"
      :class="hasDetail ? undefined : 'hidden lg:flex'"
      :ui="{ body: 'p-0 sm:p-0 gap-0' }"
    >
      <template v-if="hasDetail" #header>
        <UDashboardNavbar title="Conversation" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
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

// Both paths come from the route this page is mounted on, so the back link
// cannot end up pointing nowhere while the page itself renders.
const sitePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}`)
const messagesPath = computed(() => `${sitePath.value}/messages`)
const frame = useEditorFrame(messagesPath)
const hasDetail = computed(() => frame.mode.value === 'pair')

const pastOnly = computed(() => route.query.archived !== undefined)

// The chrome names the place; the panel names itself.
const dashboard = useDashboardSite()
const siteName = computed(() => dashboard.site.value?.brand_name ?? 'Messages')
const navbarTitle = computed(() => pastOnly.value ? 'Past conversations' : siteName.value)

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
