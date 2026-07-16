<template>
  <div class="flex gap-2">
    <label class="sr-only" :for="`${id}-country`">Country code</label>
    <select
      :id="`${id}-country`"
      v-model="countryCode"
      :disabled="disabled"
      class="w-28 shrink-0 rounded-lg border border-default bg-default px-2 py-2.5 text-sm text-default focus:border-inverted focus:outline-none focus:ring-1 focus:ring-inverted"
      @change="handleChange"
    >
      <option v-for="entry in COUNTRY_DIAL_CODES" :key="entry.iso" :value="entry.iso">
        {{ entry.flag }} {{ entry.dialCode }}
      </option>
    </select>

    <label class="sr-only" :for="id">Phone number</label>
    <input
      :id="id"
      v-model="rawNumber"
      type="tel"
      inputmode="tel"
      :placeholder="placeholder"
      :disabled="disabled"
      class="block w-full rounded-lg border border-default bg-default px-4 py-2.5 text-base text-default placeholder:text-muted focus:border-inverted focus:outline-none focus:ring-1 focus:ring-inverted"
      @input="handleInput"
      @blur="handleBlur"
      @change="handleChange"
    />
  </div>
</template>

<script setup lang="ts">
import { parsePhone, type CountryCode, type PhoneParseResult } from '~/utils/phone'

// Curated list of common countries — sourced from libphonenumber-js's own dial-code
// conventions but hardcoded here (no runtime fetch) to keep this component SSR-stable
// and dependency-light. Extend as needed; this is intentionally not exhaustive.
const COUNTRY_DIAL_CODES: Array<{ iso: CountryCode; dialCode: string; flag: string; name: string }> = [
  { iso: 'TH', dialCode: '+66', flag: '🇹🇭', name: 'Thailand' },
  { iso: 'US', dialCode: '+1', flag: '🇺🇸', name: 'United States' },
  { iso: 'GB', dialCode: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { iso: 'AU', dialCode: '+61', flag: '🇦🇺', name: 'Australia' },
  { iso: 'CA', dialCode: '+1', flag: '🇨🇦', name: 'Canada' },
  { iso: 'SG', dialCode: '+65', flag: '🇸🇬', name: 'Singapore' },
  { iso: 'MY', dialCode: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { iso: 'ID', dialCode: '+62', flag: '🇮🇩', name: 'Indonesia' },
  { iso: 'PH', dialCode: '+63', flag: '🇵🇭', name: 'Philippines' },
  { iso: 'VN', dialCode: '+84', flag: '🇻🇳', name: 'Vietnam' },
  { iso: 'KH', dialCode: '+855', flag: '🇰🇭', name: 'Cambodia' },
  { iso: 'LA', dialCode: '+856', flag: '🇱🇦', name: 'Laos' },
  { iso: 'MM', dialCode: '+95', flag: '🇲🇲', name: 'Myanmar' },
  { iso: 'CN', dialCode: '+86', flag: '🇨🇳', name: 'China' },
  { iso: 'HK', dialCode: '+852', flag: '🇭🇰', name: 'Hong Kong' },
  { iso: 'TW', dialCode: '+886', flag: '🇹🇼', name: 'Taiwan' },
  { iso: 'JP', dialCode: '+81', flag: '🇯🇵', name: 'Japan' },
  { iso: 'KR', dialCode: '+82', flag: '🇰🇷', name: 'South Korea' },
  { iso: 'IN', dialCode: '+91', flag: '🇮🇳', name: 'India' },
  { iso: 'AE', dialCode: '+971', flag: '🇦🇪', name: 'United Arab Emirates' },
  { iso: 'SA', dialCode: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { iso: 'FR', dialCode: '+33', flag: '🇫🇷', name: 'France' },
  { iso: 'DE', dialCode: '+49', flag: '🇩🇪', name: 'Germany' },
  { iso: 'ES', dialCode: '+34', flag: '🇪🇸', name: 'Spain' },
  { iso: 'IT', dialCode: '+39', flag: '🇮🇹', name: 'Italy' },
  { iso: 'NL', dialCode: '+31', flag: '🇳🇱', name: 'Netherlands' },
  { iso: 'SE', dialCode: '+46', flag: '🇸🇪', name: 'Sweden' },
  { iso: 'CH', dialCode: '+41', flag: '🇨🇭', name: 'Switzerland' },
  { iso: 'RU', dialCode: '+7', flag: '🇷🇺', name: 'Russia' },
  { iso: 'BR', dialCode: '+55', flag: '🇧🇷', name: 'Brazil' },
  { iso: 'MX', dialCode: '+52', flag: '🇲🇽', name: 'Mexico' },
  { iso: 'NZ', dialCode: '+64', flag: '🇳🇿', name: 'New Zealand' },
  { iso: 'ZA', dialCode: '+27', flag: '🇿🇦', name: 'South Africa' },
  { iso: 'NG', dialCode: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { iso: 'EG', dialCode: '+20', flag: '🇪🇬', name: 'Egypt' },
  { iso: 'IL', dialCode: '+972', flag: '🇮🇱', name: 'Israel' },
]

const props = withDefaults(defineProps<{
  modelValue?: string
  defaultCountry?: CountryCode
  placeholder?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  defaultCountry: 'TH',
  placeholder: '81 234 5678',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  parsed: [result: PhoneParseResult]
}>()

const instanceId = useId()
const id = computed(() => `phone-input-${instanceId}`)

const countryCode = ref<CountryCode>(props.defaultCountry)
const rawNumber = ref(props.modelValue)

watch(() => props.modelValue, (value) => {
  if (value !== rawNumber.value) rawNumber.value = value
})

function combinedValue(): string {
  return rawNumber.value.trim()
}

function handleInput() {
  emit('update:modelValue', combinedValue())
}

function emitParsed() {
  const result = parsePhone(combinedValue(), { defaultCountry: countryCode.value })
  emit('parsed', result)
}

function handleBlur() {
  emitParsed()
}

function handleChange() {
  emit('update:modelValue', combinedValue())
  emitParsed()
}
</script>
