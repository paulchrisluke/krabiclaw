<template>
  <GuestThreadList scope="location" submission-type-filter="reservation" />
</template>

<script setup lang="ts">
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.reservations' })
useSeoMeta({ title: 'Reservations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
