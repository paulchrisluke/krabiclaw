<template>
  <UDashboardPanel id="location-reservations">
    <template #header>
      <UDashboardNavbar :title="'Reservations'" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading v-if="locationPaths?.location" :to="locationPaths?.location" label="Location" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl">
        <GuestThreadList scope="location" submission-type-filter="reservation" embedded />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard' })

const { locationPaths } = useDashboardSiteLinks()
useSeoMeta({ title: 'Reservations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
