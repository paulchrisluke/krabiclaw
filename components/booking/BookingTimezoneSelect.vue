<template>
  <UFormField :label="t('booking.timezone')" class="shrink-0">
    <USelectMenu
      v-model.nullable="zone"
      :items="items"
      value-key="value"
      :aria-label="t('booking.timezone')"
      :portal="false"
      :search-input="{ id: searchId, placeholder: t('booking.search_timezones') }"
      :ui="{ content: 'z-50' }"
      class="w-full min-w-0"
    >
      <template #content-top>
        <label :for="searchId" class="sr-only">{{ t('booking.search_timezones') }}</label>
      </template>
    </USelectMenu>
  </UFormField>
</template>
<script setup lang="ts">
import { timezoneLabel } from '~/utils/timezone'
const props = defineProps<{ options: string[] }>()
const zone = defineModel<string | null>({ required: true })
const searchId = useId()
const { t } = useI18n()
const items = computed(() => props.options.map(value => ({ value, label: `${timezoneLabel(value)} (${value})` })))
</script>
