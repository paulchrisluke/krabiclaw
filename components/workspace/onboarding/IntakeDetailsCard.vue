<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-start gap-3 px-4 pt-4">
        <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-lucide-square-pen" class="size-4" />
        </div>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-highlighted">{{ title }}</p>
          <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ description }}</p>
        </div>
      </div>
    </template>

    <div class="@container px-4 pb-4">
      <div class="grid gap-4 @sm:grid-cols-2">
        <UFormField v-if="section === 'basics'" label="Name">
          <UInput v-model="form.name" />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="City" :required="requireLocationBasics">
          <UInput v-model="form.city" placeholder="Ao Nang" />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="Address" :required="requireLocationBasics">
          <UTextarea v-model="form.address" :rows="2" placeholder="Street, ward, district" />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="Phone" :required="requireLocationBasics">
          <UInput v-model="form.phone" type="tel" placeholder="+66..." />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="Website URL">
          <UInput v-model="form.websiteUrl" type="url" placeholder="https://..." />
        </UFormField>
        <UFormField v-if="section === 'basics'" label="Hours" :required="requireLocationBasics">
          <UTextarea
            v-model="form.openingHours"
            :rows="4"
            placeholder="Monday: 9:00 AM - 6:00 PM&#10;Tuesday: 9:00 AM - 6:00 PM"
          />
        </UFormField>
        <UFormField v-if="section === 'operations'" label="Manager alert number" required help="We'll text you here when someone books.">
          <UInput v-model="form.notificationPhone" type="tel" placeholder="+66..." />
        </UFormField>
        <UFormField v-if="section === 'operations'" label="Timezone" required>
          <USelectMenu
            v-model="form.timezone"
            :items="timezoneOptions"
            searchable
            placeholder="Select timezone"
          />
        </UFormField>
        <UFormField v-if="section === 'operations' && !showPrimaryToggle" label="Currency" required>
          <USelect
            v-model="form.currency"
            :items="currencyOptions"
            value-attribute="value"
            label-attribute="label"
          />
        </UFormField>
        <div v-if="section === 'operations' && showPrimaryToggle">
          <UCheckbox v-model="form.isPrimary" label="Make this the primary location" />
        </div>
      </div>

      <div class="mt-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
        <p class="text-[11px] text-muted">{{ helperText }}</p>
        <UButton
          color="primary"
          class="justify-center"
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
import { TIMEZONE_OPTIONS } from '~/utils/timezone'

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
  section: 'basics' | 'operations'
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const timezoneOptions = TIMEZONE_OPTIONS
const currencyOptions = CURRENCY_OPTIONS
const helperText = computed(() => props.section === 'basics'
  ? 'You can adjust these later.'
  : 'Used for bookings, alerts, and prices.'
)

const canSubmit = computed(() => {
  if (props.section === 'basics') {
    if (!props.requireLocationBasics) return !!form.value.name.trim()
    return [
      form.value.name,
      form.value.city,
      form.value.address,
      form.value.phone,
      form.value.openingHours,
    ].every(value => value.trim().length > 0)
  }

  const hasNotificationBasics = form.value.notificationPhone.trim().length > 0
    && form.value.timezone.trim().length > 0
  const hasCurrency = props.showPrimaryToggle || form.value.currency.trim().length > 0
  return hasNotificationBasics && hasCurrency
})
</script>
