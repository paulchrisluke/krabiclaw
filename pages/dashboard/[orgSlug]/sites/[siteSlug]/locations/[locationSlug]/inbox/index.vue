<template>
  <GuestThreadInbox scope="location" />
</template>

<script setup lang="ts">
import GuestThreadInbox from '~/components/workspace/inbox/GuestThreadInbox.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Location Inbox | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
