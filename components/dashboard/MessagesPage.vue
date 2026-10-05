<template>
  <DashboardIndexPanel :id="personalScope ? 'account-messages' : 'organization-messages'" :title="pastOnly && messageView === 'conversations' ? 'Past conversations' : 'Messages'" :auto-open="messageView === 'conversations' ? firstThread : null" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
    <div class="px-4 py-3"><UTabs v-model="messageView" :items="messageViews" :content="false" color="neutral" aria-label="Message view" /></div>
    <GuestThreadList v-if="messageView === 'conversations'" :personal-scope="personalScope" @first="firstThread = $event" />
    <NotificationList v-else :personal-scope="personalScope" class="px-4 pb-4" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import NotificationList from '~/components/dashboard/NotificationList.vue'
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'
const props = defineProps<{ personalScope?: boolean }>()
const route = useRoute()
const messageViews = [{ label: 'Conversations', value: 'conversations' }, { label: 'Updates', value: 'updates' }]
const messageView = computed<string | number>({
  get: () => {
    const view = route.query.view
    if (view === undefined) return 'conversations'
    if (view !== 'conversations' && view !== 'updates') throw createError({ statusCode: 400, statusMessage: 'Choose Conversations or Updates.', fatal: true })
    return view
  },
  set: view => {
    firstThread.value = null
    void navigateTo({ path: props.personalScope ? '/dashboard/account/messages' : `/dashboard/${encodeURIComponent(String(route.params.orgSlug))}/messages`, query: { ...route.query, view: String(view) } })
  },
})
const pastOnly = computed(() => route.query.archived !== undefined)
const firstThread = ref<RouteLocationRaw | null>(null)
useSeoMeta({ title: 'Messages | Krabiclaw', robots: 'noindex, nofollow' })
</script>
