<template>
  <div>
      <h1 class="m-0 mb-2 text-[36px] font-extrabold tracking-tight text-default">Choose a new password</h1>
      <p class="mb-7 text-[15px] text-muted">Use a strong password you haven’t used elsewhere.</p>

      <div v-if="notice" role="status" class="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">{{ notice }}</div>
      <div v-if="error" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>

      <div v-if="!token" class="rounded-xl border border-default/60 bg-elevated/60 p-4 text-sm text-muted">
        <p class="mb-3">This reset link is missing a token or has already been used. Request a fresh email to continue.</p>
        <NuxtLink to="/forgot-password" class="inline-flex items-center gap-1.5 rounded-lg bg-inverted px-3.5 py-2 text-sm font-medium text-inverted no-underline transition-colors hover:opacity-90">
          Request new reset link
        </NuxtLink>
      </div>

      <form v-else class="space-y-4" @submit.prevent="handleSubmit">
        <SayaFormField v-slot="{ id, describedBy, invalid }" label="New password" name="password" :error="passwordError">
          <input :id="id" v-model="password" type="password" placeholder="••••••••" :disabled="loading" autocomplete="new-password" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
        </SayaFormField>
        <div class="flex items-center justify-between gap-3">
          <NuxtLink to="/login" class="text-sm text-primary font-medium hover:underline no-underline">
            Back to sign in
          </NuxtLink>
          <PlatformButton type="submit" :loading="loading">
            Save new password
          </PlatformButton>
        </div>
      </form>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'access', auth: false })

import { authClient } from '~/lib/auth-client'
import { validatePassword } from '~/utils/password-validation'
import { FORM_INPUT_CLASS } from '~/utils/form-constants'

useSeoMeta({
  robots: 'noindex, nofollow'
})

const inputClass = FORM_INPUT_CLASS

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
