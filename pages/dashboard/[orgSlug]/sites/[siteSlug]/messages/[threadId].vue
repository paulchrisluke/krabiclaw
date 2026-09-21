<template>
  <!--
    The conversation's own column: the guest in the navbar, Details beside it
    for a thread with a record behind it, the stream in the body. The record
    opens over it as a right-hand drawer — a sheet below `sm` — the way the
    dashboard menu does. It is still a route, so back dismisses it and the URL
    is shareable.
  -->
  <UDashboardPanel id="site-messages-thread" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
    <template #header>
      <UDashboardNavbar :title="thread?.guestName ?? 'Conversation'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
        <template v-if="recordTo" #right>
          <UButton :to="recordTo" color="neutral" variant="soft" class="h-10 rounded-full px-4" :aria-label="`Show ${recordTitle.toLowerCase()}`">
            Details
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <GuestThreadDetail :thread-id="threadId" />
    </template>
  </UDashboardPanel>

  <USlideover
    :open="level.child.value !== null"
    :title="recordTitle"
    :ui="{ content: 'sm:max-w-md', body: 'p-0 sm:p-0 overflow-y-auto' }"
    @update:open="onDrawerToggle"
  >
    <template #body>
      <NuxtPage />
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import GuestThreadDetail from '~/lib/components/workspace/messages/GuestThreadDetail.vue'
import { threadRecordTitle } from '~/lib/components/workspace/messages/guest-thread-client'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const threadId = computed(() => String(route.params.threadId))
const threadPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/messages/${encodeURIComponent(threadId.value)}`)
const level = useRouteLevel()

// The drawer's title says what the record is called here, in the tenant's own
// word, so the conversation's control and the panel it opens agree.
const { thread } = await useGuestThread(threadId)
const dashboard = useDashboardSite()
const recordTitle = computed(() => thread.value
  ? threadRecordTitle(thread.value.submissionType, dashboard.site.value?.vertical ?? null)
  : 'Details')
// Opening the record keeps the list it was reached through, the same way
// closing it does. A contact thread has no record and offers no way to one.
const recordTo = computed(() => {
  if (!thread.value || thread.value.submissionType === 'contact') return null
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(route.query)) {
    // `archived` is present and empty on the past list; the emptiness is the value.
    if (typeof value === 'string') query.set(key, value)
  }
  const search = query.toString()
  return search ? `${threadPath.value}/details?${search}` : `${threadPath.value}/details`
})

// Closing is a navigation, not local state: the record has its own URL. The
// conversation keeps whichever list it was opened from, and dismissing the
// drawer is a push back to this level, never a step into history.
function onDrawerToggle(open: boolean) {
  if (!open) void level.close()
}

useSeoMeta({ title: 'Conversation | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
