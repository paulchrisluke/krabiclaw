<template>
  <div class="flex flex-1 items-center justify-center px-6 py-12">
    <div class="w-full max-w-xl">
      <h1 class="m-0 mb-2 text-[36px] font-extrabold tracking-tight text-default">Reset your password</h1>
      <p class="mb-7 text-[15px] text-muted">Enter the email you use for KrabiClaw and we’ll send you a secure reset link.</p>

      <UAlert v-if="notice" color="success" variant="soft" :description="notice" class="mb-4" />
      <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <UFormField label="Email">
          <UInput v-model="email" type="email" placeholder="you@example.com" size="lg" class="w-full" :disabled="loading" autocomplete="email" />
        </UFormField>
        <div class="flex items-center justify-between gap-3">
          <NuxtLink to="/login" class="text-sm text-primary font-medium hover:underline no-underline">
            Back to sign in
          </NuxtLink>
          <UButton type="submit" size="lg" :loading="loading">
            Send reset link
          </UButton>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform', auth: false })

import { authClient } from '~/lib/auth-client'

useSeoMeta({
  robots: 'noindex, nofollow'
})

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
