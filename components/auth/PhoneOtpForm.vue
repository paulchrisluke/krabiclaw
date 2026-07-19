<template>
  <div class="space-y-3">
    <p v-if="fixedPhone" class="text-sm text-muted">Verify <strong class="text-default">{{ fixedPhone }}</strong> to continue.</p>
    <SayaFormField v-else v-slot="{ id }" label="WhatsApp number" name="phone">
      <input :id="id" v-model="phone" type="tel" placeholder="+66 81 234 5678" :disabled="loading" :class="FORM_INPUT_CLASS" @keydown.enter.prevent="send" />
    </SayaFormField>
    <PlatformButton v-if="step === 'send'" block :loading="loading" @click="send">Send code</PlatformButton>
    <template v-else>
      <SayaFormField v-slot="{ id }" label="Verification code" name="otp-code">
        <input :id="id" v-model="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" :disabled="loading" :class="[FORM_INPUT_CLASS, 'font-mono tracking-widest text-center']" @keydown.enter.prevent="verify" />
      </SayaFormField>
      <PlatformButton block :disabled="code.length !== 6" :loading="loading" @click="verify">{{ verifyLabel }}</PlatformButton>
      <PlatformButton variant="ghost" size="sm" block :disabled="loading" @click="send">Resend code</PlatformButton>
    </template>
    <p v-if="error" role="alert" class="text-sm text-red-500">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { FORM_INPUT_CLASS } from '~/utils/form-constants'
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
