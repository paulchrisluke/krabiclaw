<template>
  <UFormField label="Timezone" required>
    <USelectMenu v-model="timezone" :items="TIMEZONE_OPTIONS" placeholder="Select timezone" :search-input="{ placeholder: 'Search by city, e.g. Bangkok' }" class="w-full">
      <template #default="{ modelValue }">{{ modelValue ? timezoneLabel(modelValue as string) : 'Select timezone' }}</template>
      <template #item-label="{ item }">{{ timezoneLabel(item as string) }}</template>
    </USelectMenu>
  </UFormField>
</template>

<script setup lang="ts">
import { TIMEZONE_OPTIONS, timezoneLabel } from '~/utils/timezone'

const timezone = defineModel<string>({ required: true })
</script>
