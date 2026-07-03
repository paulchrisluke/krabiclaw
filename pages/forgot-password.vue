<template>
  <div class="flex flex-1 items-center justify-center px-6 py-12">
    <div class="w-full max-w-xl">
      <h1 class="m-0 mb-2 text-[36px] font-extrabold tracking-tight text-default">Reset your password</h1>
      <p class="mb-7 text-[15px] text-muted">Enter the email you use for KrabiClaw and we’ll send you a secure reset link.</p>

      <div v-if="notice" role="status" class="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">{{ notice }}</div>
      <div v-if="error" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <SayaFormField v-slot="{ id, describedBy, invalid }" label="Email" name="email">
          <input :id="id" v-model="email" type="email" placeholder="you@example.com" :disabled="loading" autocomplete="email" :class="inputClass" :aria-describedby="describedBy" :aria-invalid="invalid" />
        </SayaFormField>
        <div class="flex items-center justify-between gap-3">
          <NuxtLink to="/login" class="text-sm text-primary font-medium hover:underline no-underline">
            Back to sign in
          </NuxtLink>
          <PlatformButton type="submit" :loading="loading">
            Send reset link
          </PlatformButton>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform', auth: false })

import { authClient } from '~/lib/auth-client'
import { FORM_INPUT_CLASS } from '~/utils/form-constants'

useSeoMeta({
  robots: 'noindex, nofollow'
})

const inputClass = FORM_INPUT_CLASS

const loading = ref(false)
const email = ref('')
const error = ref(null)
const notice = ref(null)

const handleSubmit = async () => {
  const normalizedEmail = email.value.trim()
  if (!normalizedEmail) {
    error.value = 'Enter your email address to continue.'
    return
  }

  loading.value = true
  error.value = null
  notice.value = null

  try {
    const result = await authClient.requestPasswordReset({
      email: normalizedEmail,
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (result?.error) {
      error.value = result.error.message ?? 'Could not send reset email.'
      return
    }

    notice.value = `If ${normalizedEmail} is registered, a reset link is on the way.`
  } catch (err) {
    error.value = err?.message ?? 'Could not send reset email.'
  } finally {
    loading.value = false
  }
}
</script>
