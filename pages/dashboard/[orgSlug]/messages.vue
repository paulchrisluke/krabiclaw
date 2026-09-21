<template>
  <UDashboardPanel id="org-messages">
    <template #header>
      <UDashboardNavbar :title="pastOnly ? 'Past conversations' : 'Messages'" :toggle="false" />
    </template>

    <template #body>
      <GuestThreadList scope="organization" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

/*
  The organization index is a view across every site, not a level with a
  detail of its own: a thread belongs to a site, and every read and mutation
  for one is site-scoped. Rows therefore re-root into the owning site's messages,
  where the thread opens beside that site's list. A detail route here would
  need a second, organization-scoped copy of the thread API.
*/
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const pastOnly = computed(() => route.query.archived !== undefined)
useSeoMeta({ title: 'Messages | KrabiClaw', robots: 'noindex, nofollow' })
</script>
