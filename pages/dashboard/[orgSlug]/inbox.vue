<template>
  <GuestThreadInbox scope="organization" />
</template>

<script setup lang="ts">
import GuestThreadInbox from '~/lib/components/workspace/inbox/GuestThreadInbox.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Inbox | KrabiClaw', robots: 'noindex, nofollow' })
</script>
