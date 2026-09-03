<template>
  <div class="onboarding-intake-card">
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
        <UFormField
          v-if="section === 'contact'"
          label="Phone"
          :required="requireLocationBasics"
          :error="phoneError"
        >
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
              <span class="flex min-w-0 items-center gap-2">
                <span class="flex size-5 items-center text-lg">{{ country?.emoji || '🇺🇸' }}</span>
                <span class="text-sm font-semibold text-highlighted">{{ countryCode }}</span>
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
                leading: 'pointer-events-none text-base sm:text-sm text-muted',
              }"
              @update:model-value="syncPhoneValue"
              @blur="phoneTouched = true"
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
            @update:model-value="submitAfterSelection"
          />
        </UFormField>
        <div v-if="section === 'location' && showPrimaryToggle">
          <UCheckbox v-model="form.isPrimary" label="Make this the primary location" />
        </div>
      </div>

      <div class="grid gap-3">
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
</template>

<script setup lang="ts">
import { vMaska } from 'maska/vue'
import { parsePhone, type CountryCode } from '~/utils/phone'
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
  actionLabel: string
  requireLocationBasics: boolean
  showPrimaryToggle: boolean
  section: 'location' | 'contact' | 'currency'
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ submit: [] }>()

const currencyOptions = CURRENCY_OPTIONS
const phone = ref('')
const phoneTouched = ref(false)
const countryCode = ref('US')
const hydratingStoredPhone = ref(false)

const { data: phoneCodes, status, execute } = useLazyFetch<PhoneCode[], unknown, string>('/api/phone-codes.json', {
  key: 'api-phone-codes',
  immediate: false,
})

const country = computed(() => phoneCodes.value?.find((c: PhoneCode) => c.code === countryCode.value))
const dialCode = computed(() => country.value?.dialCode || '+1')
const mask = computed(() => country.value?.mask || '(###) ###-####')
const parsedPhone = computed(() =>
  parsePhone(`${dialCode.value} ${phone.value}`, { defaultCountry: countryCode.value as CountryCode })
)

function onPhoneCountryOpen(open: boolean) {
  if (open && !phoneCodes.value?.length) {
    execute()
  }
}

watch(countryCode, () => {
  if (hydratingStoredPhone.value) return
  phone.value = ''
  form.value.phone = ''
})

function syncPhoneValue(value?: string | number) {
  if (value !== undefined) phone.value = String(value)
  phoneTouched.value = true
  form.value.phone = phone.value.trim() && parsedPhone.value.valid && parsedPhone.value.e164
    ? parsedPhone.value.e164
    : ''
}

watch(dialCode, syncPhoneValue)

watch(() => form.value.phone, value => {
  if (!value || value === parsedPhone.value.e164) return
  const parsed = parsePhone(value)
  if (parsed.valid && parsed.country) {
    hydratingStoredPhone.value = true
    countryCode.value = parsed.country
    phone.value = parsed.nationalFormat ?? value
    nextTick(() => {
      hydratingStoredPhone.value = false
    })
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
  return parsedPhone.value.valid
})

const phoneError = computed(() => {
  if (props.section !== 'contact' || !phoneTouched.value) return undefined
  if (!phone.value.trim()) return props.requireLocationBasics ? 'Enter a phone number.' : undefined
  return parsedPhone.value.valid ? undefined : `Enter a valid ${country.value?.name ?? countryCode.value} phone number.`
})

function submitAfterSelection() {
  if (props.section !== 'currency') return
  nextTick(() => emit('submit'))
}
</script>

<style scoped>
.onboarding-intake-card {
  display: grid;
  gap: 1rem;
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
