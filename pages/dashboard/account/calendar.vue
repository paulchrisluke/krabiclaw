<template>
  <DashboardIndexPanel id="account-calendar" title="Calendar">
    <UAlert v-if="error" color="error" title="Calendar could not be loaded" :description="getErrorMessage(error, 'Activity request failed.')" />
    <USkeleton v-else-if="pending" class="mx-auto h-96 max-w-3xl" />
    <div v-else-if="data" class="mx-auto max-w-3xl space-y-6 pb-6">
      <UCalendar v-model="selectedDay" class="w-full" :ui="calendarUi">
        <template #day="{ day }">
          <span>{{ day.day }}</span>
          <span class="mt-1 size-1 rounded-full" :class="visitsOn(day.toString()).length ? 'bg-primary' : 'bg-transparent'" />
        </template>
      </UCalendar>
      <h2 class="text-lg font-semibold text-highlighted">{{ formatCalendarDate(selectedDay.toString(), 'en', { dateStyle: 'full' }) }}</h2>
      <div v-if="selectedVisits.length" class="space-y-4"><AccountActivityCard v-for="item in selectedVisits" :key="`${item.kind}:${item.id}`" :item="item" /></div>
      <UEmpty v-else icon="i-lucide-calendar-days" title="Nothing planned" />
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import { getLocalTimeZone, today } from '@internationalized/date'
import AccountActivityCard from '~/components/dashboard/AccountActivityCard.vue'
import { formatCalendarDate, localDateAt } from '~/utils/timezone'
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Calendar | Krabiclaw', robots: 'noindex, nofollow' })
const { data, pending, error } = await useAccountActivity()
const selectedDay = shallowRef(today(getLocalTimeZone()))
const visits = computed(() => data.value?.activities.filter(item => item.operationalId && item.startsAt && item.endsAt && item.timeZone) ?? [])
function visitsOn(day: string) {
  return visits.value.filter(item => localDateAt(new Date(item.startsAt!), item.timeZone!) <= day && localDateAt(new Date(item.endsAt!), item.timeZone!) >= day)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))
}
const selectedVisits = computed(() => visitsOn(selectedDay.value.toString()))
const calendarUi = {
  root: 'w-full', grid: 'w-full', gridWeekDaysRow: 'grid grid-cols-7', headCell: 'text-center text-sm text-muted',
  gridBody: 'grid gap-1', gridRow: 'grid grid-cols-7 gap-1 place-items-stretch', cell: 'w-full p-0',
  cellTrigger: 'm-0 flex h-14 w-full flex-col items-center justify-center rounded-xl data-[outside-view]:text-dimmed data-[selected]:bg-primary data-[selected]:text-inverted',
}
</script>
