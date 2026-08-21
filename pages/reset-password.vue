<template>
  <div>
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Choose a new password</h1>
      <p class="mt-2 text-sm text-muted">Use a strong password you haven't used elsewhere.</p>

      <UAlert v-if="notice" color="success" variant="soft" :description="notice" class="mt-4" />
      <UAlert v-if="error" color="error" variant="soft" :description="error" class="mt-4" />

      <UAlert v-if="!token" color="neutral" variant="soft" class="mt-6" description="This reset link is missing a token or has already been used. Request a fresh email to continue.">
        <template #actions>
          <UButton to="/forgot-password" size="sm">Request new reset link</UButton>
        </template>
      </UAlert>

      <form v-else class="mt-6 space-y-4" @submit.prevent="handleSubmit">
        <UFormField label="New password" name="password" :error="passwordError" size="lg">
          <UInput v-model="password" type="password" placeholder="••••••••" :disabled="loading" autocomplete="new-password" size="lg" class="w-full" />
        </UFormField>
        <div class="flex items-center justify-between gap-3">
          <NuxtLink to="/login" class="text-sm text-primary font-medium hover:underline no-underline">
            Back to sign in
          </NuxtLink>
          <UButton type="submit" size="lg" :loading="loading">
            Save new password
          </UButton>
        </div>
      </form>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'access', auth: false })

import { authClient } from '~/lib/auth-client'
import { validatePassword } from '~/utils/password-validation'

useSeoMeta({
  robots: 'noindex, nofollow'
})

const route = useRoute()
const router = useRouter()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const loading = ref(false)
const password = ref('')
const passwordError = ref('')
const error = ref(null)
const notice = ref(null)

const handleSubmit = async () => {
  if (!token.value) {
    error.value = 'This reset link is invalid. Request a new one and try again.'
    return
  }

  passwordError.value = validatePassword(password.value)
  if (passwordError.value) {
    error.value = 'Please correct the highlighted field.'
    return
  }

  loading.value = true
  error.value = null
  notice.value = null

  try {
    const result = await authClient.resetPassword({
      newPassword: password.value,
      token: token.value,
    })

    if (result?.error) {
      error.value = result.error.message ?? 'Could not reset password.'
      return
    }

    notice.value = 'Your password was updated. Redirecting to sign in...'
    await router.push('/login?reset=success')
  } catch (err) {
    error.value = err?.message ?? 'Could not reset password.'
  } finally {
    loading.value = false
  }
}
</script>
