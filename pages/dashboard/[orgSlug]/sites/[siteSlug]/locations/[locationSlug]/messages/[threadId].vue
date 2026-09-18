<template>
  <!--
    The conversation keeps the column; the record it refers to opens over it as
    a right-hand drawer — a sheet below `sm` — the way the dashboard menu does.
    It is still a route, so back dismisses it and the URL is shareable.
  -->
  <GuestThreadDetail :thread-id="threadId" :thread-path="threadPath" />

  <USlideover
    :open="frame.mode.value !== 'index'"
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

definePageMeta({ layout: 'dashboard', ownsChrome: true })

const route = useRoute()
const router = useRouter()
const threadId = computed(() => String(route.params.threadId))
const threadPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}/messages/${encodeURIComponent(threadId.value)}`)
const frame = useEditorFrame(threadPath)

// The drawer's title says what the record is called here, in the tenant's own
// word, so the conversation's control and the panel it opens agree.
const { thread } = await useGuestThread(threadId)
const dashboard = useDashboardSite()
const recordTitle = computed(() => thread.value
  ? threadRecordTitle(thread.value.submissionType, dashboard.site.value?.vertical ?? null)
  : 'Details')

// Closing is a navigation, not local state: the record has its own URL. The
// conversation keeps whichever list it was opened from.
function onDrawerToggle(open: boolean) {
  if (!open) void router.push({ path: threadPath.value, query: route.query })
}

useSeoMeta({ title: 'Conversation | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
