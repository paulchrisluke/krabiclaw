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
        <UFormField label="Manager alert number" required help="Bookings get sent here by WhatsApp. Without it, alerts fall back to email only — easy to miss.">
          <UInput v-model="form.notificationPhone" type="tel" placeholder="+66..." />
        </UFormField>
        <UFormField label="Timezone" required help="Used to validate booking dates against your local time.">
          <USelectMenu
            v-model="form.timezone"
            :items="timezoneOptions"
            searchable
            placeholder="Select timezone"
          />
        </UFormField>
        <UFormField v-if="!showPrimaryToggle" label="Currency" required help="Affects how menu and experience prices are displayed site-wide.">
          <USelect
            v-model="form.currency"
            :items="currencyOptions"
            value-attribute="value"
            label-attribute="label"
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
import { CURRENCY_OPTIONS, type CurrencyCode } from '~/shared/currencies'

type IntakeForm = {
  name: string
  city: string
  address: string
  phone: string
  websiteUrl: string
  openingHours: string
  notificationPhone: string
  timezone: string
  currency: CurrencyCode
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
const currencyOptions = CURRENCY_OPTIONS

const canSubmit = computed(() => {
  // notificationPhone + timezone are never supplied by Google Maps import, and
  // a missing notification phone silently degrades booking alerts to email-only
  // with no error surfaced anywhere — so these are required on every path, not
  // just the manual-entry one. Currency is site-level (not asked again when
  // adding a location, see showPrimaryToggle) but still required up front —
  // it silently defaults to THB otherwise, wrong for any non-Thai client.
  const hasNotificationBasics = form.value.notificationPhone.trim().length > 0
    && form.value.timezone.trim().length > 0
  const hasCurrency = props.showPrimaryToggle || form.value.currency.trim().length > 0
  if (!props.requireLocationBasics) return !!form.value.name.trim() && hasNotificationBasics && hasCurrency
  return [
    form.value.name,
    form.value.city,
    form.value.address,
    form.value.phone,
    form.value.openingHours,
  ].every(value => value.trim().length > 0) && hasNotificationBasics && hasCurrency
})
</script>
