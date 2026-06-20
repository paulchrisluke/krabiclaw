<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-heroicons-pencil-square" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="px-4 pb-4">
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Name">
          <UInput v-model="form.name" />
        </UFormField>
        <UFormField label="City" :required="requireLocationBasics">
          <UInput v-model="form.city" placeholder="Ao Nang" />
        </UFormField>
        <UFormField label="Address" class="sm:col-span-2" :required="requireLocationBasics">
          <UTextarea v-model="form.address" :rows="2" placeholder="Street, ward, district" />
        </UFormField>
        <UFormField label="Phone" :required="requireLocationBasics">
          <UInput v-model="form.phone" type="tel" placeholder="+66..." />
        </UFormField>
        <UFormField label="Website URL">
          <UInput v-model="form.websiteUrl" type="url" placeholder="https://..." />
        </UFormField>
        <UFormField label="Hours" class="sm:col-span-2" :required="requireLocationBasics">
          <UTextarea
            v-model="form.openingHours"
            :rows="4"
            placeholder="Monday: 9:00 AM - 6:00 PM&#10;Tuesday: 9:00 AM - 6:00 PM"
          />
        </UFormField>
        <UFormField label="Notification phone">
          <UInput v-model="form.notificationPhone" type="tel" placeholder="+66..." />
        </UFormField>
        <UFormField label="Timezone">
          <USelectMenu
            v-model="form.timezone"
            :items="timezoneOptions"
            searchable
            placeholder="Select timezone"
          />
        </UFormField>
        <div v-if="showPrimaryToggle" class="sm:col-span-2">
          <UCheckbox v-model="form.isPrimary" label="Make this the primary location" />
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between gap-3">
        <p class="text-[11px] text-muted">
          {{ requireLocationBasics
            ? 'I need the basics before I can create this draft.'
            : 'You can leave anything blank and edit it later in the dashboard.' }}
        </p>
        <UButton
          color="primary"
          :loading="loading"
          :disabled="disabled || !canSubmit"
          @click="$emit('submit')"
        >
          {{ actionLabel }}
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
type IntakeForm = {
  name: string
  city: string
  address: string
  phone: string
  websiteUrl: string
  openingHours: string
  notificationPhone: string
  timezone: string
  isPrimary: boolean
}

const form = defineModel<IntakeForm>('form', { required: true })

const props = defineProps<{
  title: string
  description: string
  actionLabel: string
  requireLocationBasics: boolean
  showPrimaryToggle: boolean
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const timezoneOptions = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

const canSubmit = computed(() => {
  if (!props.requireLocationBasics) return !!form.value.name.trim()
  return [
    form.value.name,
    form.value.city,
    form.value.address,
    form.value.phone,
    form.value.openingHours,
  ].every(value => value.trim().length > 0)
})
</script>
