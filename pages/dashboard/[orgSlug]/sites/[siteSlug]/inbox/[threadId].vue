<template>
  <GuestThreadInbox scope="site" :thread-id="threadId" />
</template>

<script setup lang="ts">
import GuestThreadInbox from '~/lib/components/workspace/inbox/GuestThreadInbox.vue'

const route = useRoute()
const threadId = computed(() => typeof route.params.threadId === 'string' ? route.params.threadId : null)

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Conversation | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
