<template>
  <!-- The team. Inviting someone is a leaf below. -->
  <DashboardIndexPanel id="organization-members" title="Members">
    <OrganizationMembersList />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import OrganizationMembersList from '~/components/dashboard/OrganizationMembersList.vue'

definePageMeta({ layout: 'dashboard' })

useSeoMeta({ title: 'Members | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
