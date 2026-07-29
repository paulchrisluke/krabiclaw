<template>
  <UCard class="onboarding-intake-card" :ui="{ body: 'p-0 sm:p-0' }">
    <div class="space-y-5 p-6 sm:p-7">
      <div class="flex items-start gap-4">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon name="i-lucide-square-pen" class="size-5" />
        </div>
        <div class="min-w-0 pt-0.5">
          <p class="text-[17px] font-bold leading-6 text-highlighted">{{ title }}</p>
          <p class="mt-1 text-[15px] leading-6 text-muted">{{ description }}</p>
        </div>
      </div>

      <div class="grid gap-4">
        <UFormField v-if="section === 'location'" label="City" :required="requireLocationBasics">
          <UInput v-model="form.city" class="w-full" size="xl" placeholder="Ao Nang" />
        </UFormField>
        <UFormField v-if="section === 'location'" label="Address" :required="requireLocationBasics">
          <UTextarea v-model="form.address" class="w-full" size="xl" :rows="2" placeholder="Street, ward, district" />
        </UFormField>
        <UFormField v-if="section === 'contact'" label="Phone" :required="requireLocationBasics">
          <UInput v-model="form.phone" class="w-full" size="xl" type="tel" placeholder="+66..." />
        </UFormField>
        <UFormField v-if="section === 'currency'" label="Currency" required>
          <USelectMenu
            v-model="form.currency"
            class="w-full"
            size="xl"
            :items="currencyOptions"
            value-key="value"
            label-key="label"
            placeholder="Select currency"
          />
        </UFormField>
        <div v-if="section === 'location' && showPrimaryToggle">
          <UCheckbox v-model="form.isPrimary" label="Make this the primary location" />
        </div>
      </div>

      <div class="grid gap-4">
        <p class="text-[13px] leading-5 text-muted">{{ helperText }}</p>
        <UButton
          color="primary"
          size="xl"
          block
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

type IntakeForm = {
  name: string
  city: string
  address: string
  phone: string
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
  section: 'location' | 'contact' | 'currency'
  loading?: boolean
  disabled?: boolean
}>()

defineEmits<{ submit: [] }>()

const helperText = computed(() => 'You can adjust these later.')
const currencyOptions = CURRENCY_OPTIONS

const canSubmit = computed(() => {
  if (props.section === 'currency') return !!form.value.currency
  if (!props.requireLocationBasics) return true
  if (props.section === 'location') {
    return [form.value.city, form.value.address].every(value => value.trim().length > 0)
  }
  return form.value.phone.trim().length > 0
})
</script>

<style scoped>
.onboarding-intake-card {
  border-radius: 22px;
}

.onboarding-intake-card :deep(.rounded-md),
.onboarding-intake-card :deep(.rounded-lg) {
  border-radius: 14px;
}

.onboarding-intake-card :deep(label) {
  color: var(--ui-text-muted);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
</style>
