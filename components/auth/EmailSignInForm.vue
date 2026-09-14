<template>
  <form method="post" class="space-y-3" @submit.prevent="submit">
    <UFormField label="Email" name="login-email" size="lg">
      <UInput v-model="email" type="email" placeholder="you@example.com" :disabled="loading" autocomplete="email" size="lg" class="w-full" />
    </UFormField>
    <UFormField label="Password" name="login-password" size="lg">
      <UInput v-model="password" type="password" placeholder="••••••••" :disabled="loading" autocomplete="current-password" size="lg" class="w-full" />
    </UFormField>
    <UButton type="submit" size="lg" block :ui="{ base: 'justify-start' }" :loading="loading">
      Sign in with email
      <UBadge v-if="lastUsed" color="neutral" variant="subtle" size="sm" class="ml-auto shrink-0">Last used</UBadge>
    </UButton>
    <p class="text-sm">
      <NuxtLink to="/forgot-password" class="text-primary font-medium hover:underline no-underline">Forgot password?</NuxtLink>
    </p>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
  </form>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { requiresEmailVerification } from '~/shared/auth/email-sign-in'

const props = withDefaults(defineProps<{ callbackUrl: string; initialEmail?: string; lastUsed?: boolean }>(), { initialEmail: '', lastUsed: false })
const emit = defineEmits<{ verificationRequired: [email: string] }>()
const email = ref(props.initialEmail)
const password = ref('')
const { loading, error, run } = useAuthOperation()

async function submit() {
  const normalizedEmail = email.value.trim()
  const result = await run(() => authClient.signIn.email({ email: normalizedEmail, password: password.value, callbackURL: props.callbackUrl }), 'Sign in failed. Please try again.')
  if (result?.error) {
    error.value = result.error.message || 'Sign in failed. Please try again.'
    if (requiresEmailVerification(result.error)) emit('verificationRequired', normalizedEmail)
  }
}
</script>
