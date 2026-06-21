<template>
  <div class="flex flex-1 items-center justify-center px-6 py-12">
    <div class="w-full max-w-xl">
      <h1 class="m-0 mb-2 text-[36px] font-extrabold tracking-tight text-default">Choose a new password</h1>
      <p class="mb-7 text-[15px] text-muted">Use a strong password you haven’t used elsewhere.</p>

      <UAlert v-if="notice" color="success" variant="soft" :description="notice" class="mb-4" />
      <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

      <div v-if="!token" class="rounded-xl border border-default/60 bg-elevated/60 p-4 text-sm text-muted">
        This reset link is missing a token or has already been used. Request a fresh email to continue.
      </div>

      <form v-else class="space-y-4" @submit.prevent="handleSubmit">
        <UFormField label="New password" :error="passwordError">
          <UInput v-model="password" type="password" placeholder="••••••••" size="lg" class="w-full" :disabled="loading" autocomplete="new-password" />
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
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform', auth: false })

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
