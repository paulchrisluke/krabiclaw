<template>
  <DashboardIndexPanel id="account-message-thread" :title="thread?.organizationName || 'Conversation'" :ui="{ body: 'p-0 sm:p-0 gap-0' }" fill>
    <template v-if="activityTo" #right><UButton :to="activityTo" color="neutral" variant="soft" class="rounded-full" label="Details" /></template>
    <GuestThreadDetail :thread-id="threadId" personal-scope />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import GuestThreadDetail from '~/lib/components/workspace/messages/GuestThreadDetail.vue'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Conversation | Krabiclaw', robots: 'noindex, nofollow' })
const route = useRoute()
const threadId = computed(() => {
  if (typeof route.params.threadId !== 'string' || !route.params.threadId) throw createError({ statusCode: 404, statusMessage: 'Conversation not found.', fatal: true })
  return route.params.threadId
})
const { thread } = await useGuestThread(threadId, computed(() => true))
const activityTo = computed(() => thread.value?.activityPath || null)
</script>
