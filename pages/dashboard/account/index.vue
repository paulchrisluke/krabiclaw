<template>
  <DashboardIndexPanel id="account-today" title="Today">
    <UAlert v-if="error" color="error" title="Today could not be loaded" :description="getErrorMessage(error, 'Activity request failed.')" />
    <div v-else-if="pending" class="space-y-4"><USkeleton v-for="index in 3" :key="index" class="h-32 rounded-2xl" /></div>
    <div v-else-if="data" class="mx-auto max-w-3xl space-y-8 pb-6">
      <section>
        <div v-if="todayItems.length" class="space-y-4"><AccountActivityCard v-for="item in todayItems" :key="`${item.kind}:${item.id}`" :item="item" /></div>
        <UEmpty v-else icon="i-lucide-calendar-days" title="Nothing planned today" />
      </section>
      <section v-if="upcomingItems.length" class="space-y-4">
        <h2 class="text-xl font-semibold text-highlighted">Upcoming</h2>
        <AccountActivityCard v-for="item in upcomingItems" :key="`${item.kind}:${item.id}`" :item="item" />
      </section>
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import AccountActivityCard from '~/components/dashboard/AccountActivityCard.vue'
import { localDateAt } from '~/utils/timezone'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Today | Krabiclaw', robots: 'noindex, nofollow' })
const { data, pending, error } = await useAccountActivity()
const now = new Date()
const visits = computed(() => data.value?.activities.filter(item => item.operationalId && item.startsAt && item.endsAt && item.timeZone && item.status !== 'cancelled') ?? [])
const todayItems = computed(() => visits.value.filter(item => localDateAt(new Date(item.startsAt!), item.timeZone!) <= localDateAt(now, item.timeZone!) && localDateAt(new Date(item.endsAt!), item.timeZone!) >= localDateAt(now, item.timeZone!)))
const upcomingItems = computed(() => visits.value.filter(item => localDateAt(new Date(item.startsAt!), item.timeZone!) > localDateAt(now, item.timeZone!)).sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!)))
</script>
