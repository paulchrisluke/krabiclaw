<template>
  <form @submit.prevent="submit" class="booking-contact-form space-y-4">
    <div>
      <label for="booking-name" class="block text-sm font-medium text-default mb-1">{{ t('saya.experience_detail.full_name') }}</label>
      <input 
        id="booking-name"
        v-model="form.name"
        type="text"
        required
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-email" class="block text-sm font-medium text-default mb-1">{{ t('saya.experience_detail.email_address') }}</label>
      <input 
        id="booking-email"
        v-model="form.email"
        type="email"
        required
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default"
      />
    </div>

    <div>
      <label for="booking-phone" class="block text-sm font-medium text-default mb-1">{{ t('saya.experience_detail.phone_number') }} <span v-if="!phoneRequired" class="text-muted font-normal">({{ t('saya.experience_detail.optional') }})</span></label>
      <div class="flex gap-2">
      <select v-model="countryCode" :aria-label="t('booking.phone_country')" class="w-32 rounded-lg border border-default bg-default px-2">
        <option value="">{{ t('booking.international') }}</option>
        <option v-for="country in countries" :key="country.code" :value="country.code">{{ country.name }} {{ country.dialCode }}</option>
      </select>
      <input
        ref="phoneInput"
        id="booking-phone"
        v-model="form.phone"
        type="tel"
        :required="phoneRequired"
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default"
      />
      </div>
    </div>

    <div>
      <label for="booking-notes" class="block text-sm font-medium text-default mb-1">{{ t('saya.experience_detail.special_requests') }} <span class="text-muted font-normal">({{ t('saya.experience_detail.optional') }})</span></label>
      <textarea 
        id="booking-notes"
        v-model="form.notes"
        rows="3"
        class="w-full px-3 py-2 border border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-default resize-none"
      ></textarea>
    </div>

    <div class="pt-2">
      <SayaButton type="submit" size="lg" block :loading="loading" :disabled="loading">
        {{ loading ? t('saya.experience_detail.processing') : submitText || t('saya.experience_detail.confirm_booking') }}
      </SayaButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { listPhoneCountries, parsePhone, type CountryCode } from '~/utils/phone'

export interface ContactFormState {
  name: string
  email: string
  phone: string
  notes: string
}

const props = withDefaults(defineProps<{
  initialState?: Partial<ContactFormState>
  loading?: boolean
  submitText?: string
  phoneRequired?: boolean
}>(), {
  loading: false,
  phoneRequired: false
})
const { t, locale } = useI18n()
const phoneInput = ref<HTMLInputElement | null>(null)
const countryCode = ref<CountryCode | ''>(parsePhone(props.initialState?.phone ?? '').country ?? '')
const countries = computed(() => {
  const names = new Intl.DisplayNames(locale.value, { type: 'region' })
  return listPhoneCountries().map(country => ({ ...country, name: names.of(country.code) ?? country.code })).sort((a, b) => a.name.localeCompare(b.name, locale.value))
})

const emit = defineEmits<{
  submit: [form: ContactFormState]
}>()

const form = reactive<ContactFormState>({
  name: props.initialState?.name || '',
  email: props.initialState?.email || '',
  phone: props.initialState?.phone || '',
  notes: props.initialState?.notes || ''
})

watch([() => form.phone, countryCode], () => phoneInput.value?.setCustomValidity(''))
function submit() {
  const parsed = parsePhone(form.phone, countryCode.value ? { defaultCountry: countryCode.value } : undefined)
  if (form.phone && (!parsed.valid || !parsed.e164)) {
    phoneInput.value?.setCustomValidity(t('booking.invalid_phone'))
    phoneInput.value?.reportValidity()
    return
  }
  emit('submit', { ...form, phone: parsed.e164 ?? '' })
}
</script>
