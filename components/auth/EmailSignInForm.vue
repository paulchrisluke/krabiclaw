<template>
  <form class="space-y-3" @submit.prevent="submit">
    <SayaFormField v-slot="{ id }" label="Email" name="login-email">
      <input :id="id" v-model="email" type="email" placeholder="you@example.com" :disabled="loading" autocomplete="email" :class="FORM_INPUT_CLASS" />
    </SayaFormField>
    <SayaFormField v-slot="{ id }" label="Password" name="login-password">
      <input :id="id" v-model="password" type="password" placeholder="••••••••" :disabled="loading" autocomplete="current-password" :class="FORM_INPUT_CLASS" />
    </SayaFormField>
    <div class="flex items-center justify-between gap-3 text-sm">
      <NuxtLink to="/forgot-password" class="text-primary font-medium hover:underline no-underline">Forgot password?</NuxtLink>
      <PlatformButton type="submit" :loading="loading">Sign in with email</PlatformButton>
    </div>
    <p v-if="error" role="alert" class="text-sm text-red-500">{{ error }}</p>
  </form>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { FORM_INPUT_CLASS } from '~/utils/form-constants'

const props = withDefaults(defineProps<{ callbackUrl: string; initialEmail?: string }>(), { initialEmail: '' })
const emit = defineEmits<{ verificationRequired: [email: string] }>()
const email = ref(props.initialEmail)
const password = ref('')
const { loading, error, run } = useAuthOperation()

async function submit() {
  const normalizedEmail = email.value.trim()
  const result = await run(() => authClient.signIn.email({ email: normalizedEmail, password: password.value, callbackURL: props.callbackUrl }), 'Sign in failed. Please try again.')
  if (result?.error) {
    error.value = result.error.message || 'Sign in failed. Please try again.'
    if (/verif/i.test(error.value)) emit('verificationRequired', normalizedEmail)
  }
}
</script>
