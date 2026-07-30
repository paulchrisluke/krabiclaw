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
        <template v-if="section === 'location'">
          <UFormField label="Street address" :required="requireLocationBasics">
            <UInput v-model="form.streetAddress" class="w-full" size="xl" placeholder="123 Beach Road" />
          </UFormField>
          <UFormField label="Unit, floor, or neighborhood">
            <UInput v-model="form.addressLine2" class="w-full" size="xl" placeholder="Suite, village, landmark" />
          </UFormField>
          <div class="@container">
            <div class="grid gap-4 @sm:grid-cols-2">
              <UFormField label="City or town" :required="requireLocationBasics">
                <UInput v-model="form.city" class="w-full" size="xl" placeholder="Ao Nang" />
              </UFormField>
              <UFormField label="Province or region">
                <UInput v-model="form.region" class="w-full" size="xl" placeholder="Krabi" />
              </UFormField>
              <UFormField label="Postal code">
                <UInput v-model="form.postalCode" class="w-full" size="xl" inputmode="numeric" placeholder="81000" />
              </UFormField>
              <UFormField label="Country">
                <UInput v-model="form.country" class="w-full" size="xl" placeholder="Thailand" />
              </UFormField>
            </div>
          </div>
        </template>
        <UFormField v-if="section === 'contact'" label="Phone" :required="requireLocationBasics">
          <UFieldGroup class="w-full gap-2">
            <USelectMenu
              v-model="countryCode"
              :items="phoneCodes"
              value-key="code"
              :search-input="{
                placeholder: 'Search country...',
                icon: 'i-lucide-search',
                loading: status === 'pending',
              }"
              :filter-fields="['name', 'code', 'dialCode']"
              :content="{ align: 'start' }"
              class="shrink-0"
              :ui="{
                base: 'w-[6.5rem] justify-between pe-8',
                content: 'w-48',
                placeholder: 'hidden',
                trailingIcon: 'size-4',
              }"
              trailing-icon="i-lucide-chevrons-up-down"
              @update:open="onPhoneCountryOpen"
            >
              <span class="flex size-5 items-center text-lg">
                {{ country?.emoji || '🇺🇸' }}
              </span>

              <template #item-leading="{ item }">
                <span class="flex size-5 items-center text-lg">
                  {{ item.emoji }}
                </span>
              </template>

              <template #item-label="{ item }">
                {{ item.name }} ({{ item.dialCode }})
              </template>
            </USelectMenu>

            <UInput
              v-model="phone"
              v-maska="mask"
              class="min-w-0 flex-1"
              size="xl"
              type="tel"
              :placeholder="mask.replaceAll('#', '_')"
              :style="{ '--dial-code-length': `${dialCode.length + 1.5}ch` }"
              :ui="{
                base: 'ps-(--dial-code-length)',
                leading: 'pointer-events-none text-base md:text-sm text-muted',
              }"
              @update:model-value="syncPhoneValue"
            >
              <template #leading>
                {{ dialCode }}
              </template>
            </UInput>
          </UFieldGroup>
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
import { vMaska } from 'maska/vue'
import { CURRENCY_OPTIONS, type CurrencyCode } from '~/shared/currencies'

type PhoneCode = {
  name: string
  code: string
  emoji: string
  dialCode: string
  mask: string
}

type IntakeForm = {
  name: string
  city: string
  address: string
  streetAddress: string
  addressLine2: string
  region: string
  postalCode: string
  country: string
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
const phone = ref('')
const countryCode = ref('US')

const { data: phoneCodes, status, execute } = await useLazyFetch<PhoneCode[]>('/api/phone-codes.json', {
  key: 'api-phone-codes',
  immediate: false,
})

const country = computed(() => phoneCodes.value?.find((c: PhoneCode) => c.code === countryCode.value))
const dialCode = computed(() => country.value?.dialCode || '+1')
const mask = computed(() => country.value?.mask || '(###) ###-####')

function onPhoneCountryOpen(open: boolean) {
  if (open && !phoneCodes.value?.length) {
    execute()
  }
}

watch(countryCode, () => {
  phone.value = ''
  form.value.phone = ''
})

function syncPhoneValue(value?: string | number) {
  if (value !== undefined) phone.value = String(value)
  form.value.phone = phone.value.trim() ? `${dialCode.value} ${phone.value}` : ''
}

watch(dialCode, syncPhoneValue)

watch(() => form.value.phone, value => {
  if (!value || value === `${dialCode.value} ${phone.value}`) return
  const matchingCountry = phoneCodes.value?.find((code: PhoneCode) => value.startsWith(`${code.dialCode} `))
  if (matchingCountry) {
    countryCode.value = matchingCountry.code
    phone.value = value.slice(matchingCountry.dialCode.length).trim()
    return
  }
  phone.value = value
}, { immediate: true })

const canSubmit = computed(() => {
  if (props.section === 'currency') return !!form.value.currency
  if (!props.requireLocationBasics) return true
  if (props.section === 'location') {
    return [form.value.streetAddress, form.value.city].every(value => value.trim().length > 0)
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
