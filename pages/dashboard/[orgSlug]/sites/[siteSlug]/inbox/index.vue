<template>
  <GuestThreadInbox scope="site" />
</template>

<script setup lang="ts">
import GuestThreadInbox from '~/lib/components/workspace/inbox/GuestThreadInbox.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Site Inbox | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
