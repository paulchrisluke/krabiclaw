<template>
  <!-- One closure, or one date with its own hours, and what guests are told about it. -->
  <div class="space-y-6">
    <template v-if="entry.kind === 'closure'">
      <UFormField label="Closed from"><UInput v-model="entry.starts_on" type="date" class="w-full" /></UFormField>
      <UFormField label="Last closed date" hint="Optional"><UInput :model-value="entry.ends_on ?? ''" type="date" class="w-full" @update:model-value="entry.ends_on = String($event) || null" /></UFormField>
    </template>
    <template v-else>
      <UFormField label="Date"><UInput v-model="entry.date" type="date" class="w-full" /></UFormField>
      <div v-for="(period, index) in entry.periods" :key="index" class="space-y-4 border-b border-default pb-6">
        <div class="flex items-end gap-3">
          <UFormField label="Opens at" class="flex-1"><UInput v-model="period.open_time" type="time" class="w-full" /></UFormField>
          <UFormField label="Closes at" class="flex-1"><UInput v-model="period.close_time" type="time" class="w-full" /></UFormField>
          <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" square aria-label="Remove these hours" @click="entry.periods.splice(index, 1)" />
        </div>
        <SettingRow :model-value="period.close_day_offset === 1" label="Closes the next day" @update:model-value="period.close_day_offset = $event ? 1 : 0" />
      </div>
      <UButton icon="i-lucide-plus" color="neutral" variant="soft" class="rounded-full" label="Add hours" @click="entry.periods.push({ open_time: '09:00', close_time: '17:00', close_day_offset: 0 })" />
    </template>
    <UFormField label="Message for guests" hint="Optional"><UInput :model-value="entry.note ?? ''" class="w-full" @update:model-value="entry.note = String($event) || null" /></UFormField>
  </div>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import type { SpecialHoursEntry } from './hours'

const entry = defineModel<SpecialHoursEntry>('entry', { required: true })
</script>
