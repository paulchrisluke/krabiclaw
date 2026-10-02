<template>
  <label class="block shrink-0 text-sm text-muted">
    Timezone
    <select v-model="zone" class="mt-1 w-full min-w-0 rounded-lg border border-default bg-default px-3 py-2 text-default focus:outline-2 focus:-outline-offset-2 focus:outline-primary">
      <option v-for="option in options" :key="option" :value="option">{{ timezoneLabel(option) }} ({{ option }})</option>
    </select>
  </label>
</template>
<script setup lang="ts">
import { timezoneLabel } from '~/utils/timezone'
defineProps<{ options: string[] }>()
const zone = defineModel<string | null>({ required: true })
</script>
