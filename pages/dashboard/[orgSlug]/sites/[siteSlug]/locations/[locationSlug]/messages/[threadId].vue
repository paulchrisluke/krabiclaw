<template>
  <!--
    The conversation is a level of its own, not a leaf: opening the record
    behind it re-roots, so the thread list leaves and the conversation becomes
    the index column with the record beside it.
  -->
  <EditorPaneShell
    v-if="frame.mode.value === 'pair'"
    has-detail
    :dismiss-to="threadPath"
    :detail-title="recordTitle"
    wide-detail
    hide-detail-heading
  >
    <template #index>
      <GuestThreadDetail :thread-id="threadId" :thread-path="threadPath" />
    </template>
    <template #detail>
      <NuxtPage />
    </template>
  </EditorPaneShell>

  <GuestThreadDetail v-else :thread-id="threadId" :thread-path="threadPath" />
</template>

<script setup lang="ts">
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import GuestThreadDetail from '~/lib/components/workspace/messages/GuestThreadDetail.vue'
import { threadRecordTitle } from '~/lib/components/workspace/messages/guest-thread-client'

definePageMeta({ layout: 'dashboard', ownsChrome: true })

const route = useRoute()
const threadId = computed(() => String(route.params.threadId))
const threadPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/locations/${String(route.params.locationSlug)}/messages/${encodeURIComponent(threadId.value)}`)
const frame = useEditorFrame(threadPath)

// The detail header says what the record is called here, in the tenant's own
// word, so the conversation's control and the panel it opens agree.
const { thread } = await useGuestThread(threadId)
const dashboard = useDashboardSite()
const recordTitle = computed(() => thread.value
  ? threadRecordTitle(thread.value.submissionType, dashboard.site.value?.vertical ?? null)
  : 'Details')

useSeoMeta({ title: 'Conversation | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
