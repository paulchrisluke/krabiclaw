<template>
  <GuestThreadInbox scope="location" submission-type-filter="reservation" />
</template>

<script setup lang="ts">
import GuestThreadInbox from '~/components/workspace/inbox/GuestThreadInbox.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.reservations' })
useSeoMeta({ title: 'Reservations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
