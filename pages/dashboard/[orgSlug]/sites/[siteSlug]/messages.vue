<template>
  <!--
    Messages, a tab root: the list is the left column and the conversation the
    right one, the way every mail client and Airbnb's own inbox reads. Where
    there is a second column the newest thread opens into it on arrival; below
    that width the list is the whole screen and a thread is somewhere you go.
    A list panel is not a form: its rows run to the edge of the column.
  -->
  <DashboardIndexPanel
    id="site-messages"
    :title="pastOnly ? 'Past conversations' : 'Messages'"
    :auto-open="firstThread"
    :ui="{ body: 'p-0 sm:p-0 gap-0' }"
  >
    <GuestThreadList scope="site" @first="firstThread = $event" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import GuestThreadList from '~/lib/components/workspace/messages/GuestThreadList.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const pastOnly = computed(() => route.query.archived !== undefined)
const firstThread = ref<RouteLocationRaw | null>(null)

useSeoMeta({ title: 'Messages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
