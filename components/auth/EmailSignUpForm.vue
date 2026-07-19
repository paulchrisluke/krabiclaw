<template>
  <form class="space-y-3" @submit.prevent="submit">
    <SayaFormField v-slot="{ id, describedBy, invalid }" label="Email" name="signup-email" :error="emailError">
      <input :id="id" v-model="email" type="email" placeholder="you@example.com" :disabled="loading" autocomplete="email" :class="FORM_INPUT_CLASS" :aria-describedby="describedBy" :aria-invalid="invalid" />
    </SayaFormField>
    <SayaFormField v-slot="{ id, describedBy, invalid }" label="Password" name="signup-password" :error="passwordError">
      <input :id="id" v-model="password" type="password" placeholder="••••••••" :disabled="loading" autocomplete="new-password" :class="FORM_INPUT_CLASS" :aria-describedby="describedBy" :aria-invalid="invalid" />
    </SayaFormField>
    <PlatformButton type="submit" size="lg" block :loading="loading">Create account</PlatformButton>
    <p v-if="error" role="alert" class="text-sm text-red-500">{{ error }}</p>
  </form>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { validatePassword } from '~/utils/password-validation'
import { FORM_INPUT_CLASS } from '~/utils/form-constants'

const props = defineProps<{ callbackUrl: string }>()
const emit = defineEmits<{ success: [email: string] }>()
const email = ref('')
const password = ref('')
const emailError = ref('')
const passwordError = ref('')
const { loading, error, run } = useAuthOperation()

async function submit() {
  const normalizedEmail = email.value.trim()
  emailError.value = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ? '' : 'Please enter a valid email address.'
  passwordError.value = validatePassword(password.value)
  if (emailError.value || passwordError.value) return
  const result = await run(() => authClient.signUp.email({ email: normalizedEmail, password: password.value, name: normalizedEmail.split('@')[0] || 'User', callbackURL: props.callbackUrl }), 'Sign up failed. Please try again.')
  if (result?.error) error.value = result.error.message || 'Sign up failed. Please try again.'
  else if (result) emit('success', normalizedEmail)
}
</script>
