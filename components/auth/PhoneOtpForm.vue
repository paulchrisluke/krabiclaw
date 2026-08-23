<template>
  <div class="space-y-3">
    <p v-if="fixedPhone" class="text-sm text-muted">Verify <strong class="text-default">{{ fixedPhone }}</strong> to continue.</p>
    <UFormField v-else label="WhatsApp number" name="phone" size="lg">
      <UInput v-model="phone" type="tel" placeholder="+66 81 234 5678" :disabled="loading" size="lg" class="w-full" @keydown.enter.prevent="send" />
    </UFormField>
    <UButton v-if="step === 'send'" block size="lg" :loading="loading" @click="send">Send code</UButton>
    <template v-else>
      <UFormField label="Verification code" name="otp-code" size="lg">
        <UInput v-model="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" :disabled="loading" size="lg" class="w-full font-mono tracking-widest text-center" @keydown.enter.prevent="verify" />
      </UFormField>
      <UButton block size="lg" :disabled="code.length !== 6" :loading="loading" @click="verify">{{ verifyLabel }}</UButton>
      <UButton variant="ghost" size="sm" block :disabled="loading" @click="send">Resend code</UButton>
    </template>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
  </div>
</template>

<script setup lang="ts">
import type { CountryCode } from '~/utils/phone'

const props = withDefaults(defineProps<{ fixedPhone?: string; defaultCountry?: CountryCode; verifyLabel?: string }>(), {
  fixedPhone: '', defaultCountry: 'TH', verifyLabel: 'Verify and continue',
})
const emit = defineEmits<{ verified: [phone: string] }>()
const phone = ref(props.fixedPhone)
const code = ref('')
const step = ref<'send' | 'verify'>('send')
const flow = usePhoneOtpFlow({ defaultCountry: props.defaultCountry })
const { loading, error } = flow

async function send() {
  const result = await flow.sendOtp(props.fixedPhone || phone.value)
  if (result.ok) {
    phone.value = result.phone
    step.value = 'verify'
  }
}

async function verify() {
  const result = await flow.verifyOtp(props.fixedPhone || phone.value, code.value)
  if (result.ok) emit('verified', result.phone)
  else code.value = ''
}
</script>
