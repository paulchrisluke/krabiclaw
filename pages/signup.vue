<template>
  <div class="flex-1 grid lg:grid-cols-2">

    <!-- Mascot side -->
    <aside class="hidden lg:flex flex-col items-center justify-center bg-elevated px-12 py-12">
      <img src="/krabiclaw-login-mascot.png" alt="KrabicLaw mascot" class="w-full max-w-115 block" />
      <p class="text-[14px] text-muted text-center max-w-sm mt-5 leading-relaxed">
        "We launched our menu in 12 minutes and got our first online reservation the same night." —
        <strong class="text-default">Saya, Kikuzuki Krabi</strong>
      </p>
    </aside>

    <!-- Form side -->
    <div class="flex items-center justify-center px-8 py-12">
      <div class="w-full max-w-105">
        <h1 class="text-[36px] font-extrabold tracking-tight text-default m-0 mb-2">Create your account</h1>
        <p class="text-[15px] text-muted mb-7">Sign up, connect the KrabiClaw app in ChatGPT, and start editing through conversation.</p>

        <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

        <div class="space-y-3">
          <!-- Google -->
          <button
            @click="handleGoogleSignIn"
            :disabled="loading"
            class="w-full flex items-center justify-center gap-3 h-11.5 bg-elevated border border-default rounded-[10px] text-[14px] font-semibold text-default hover:bg-muted transition-colors disabled:opacity-50"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <!-- Divider -->
          <div class="flex items-center gap-3 py-1">
            <div class="flex-1 h-px bg-default" />
            <span class="text-[12px] text-dimmed uppercase tracking-[0.18em]">or continue with</span>
            <div class="flex-1 h-px bg-default" />
          </div>

          <!-- Email Signup -->
          <form @submit.prevent="handleEmailSignup" class="space-y-3">
            <UFormField label="Email" :error="validationErrors.email">
              <UInput v-model="form.email" type="email" placeholder="you@example.com" size="lg" class="w-full" :disabled="loading" autocomplete="email" />
            </UFormField>
            <UFormField label="Password" :error="validationErrors.password">
              <UInput v-model="form.password" type="password" placeholder="••••••••" size="lg" class="w-full" :disabled="loading" autocomplete="new-password" />
            </UFormField>
            <UButton type="submit" block size="lg" :loading="loading">
              Create Account
            </UButton>
          </form>
        </div>

        <!-- Sign In Link -->
        <div class="mt-6 text-center text-sm text-muted">
          Already have an account?
          <NuxtLink to="/login" class="text-primary font-semibold hover:underline no-underline">
            Sign in →
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'platform',
  auth: false
})

import { authClient } from '~/lib/auth-client'
import { validatePassword } from '~/utils/password-validation'

const router = useRouter()
const loading = ref(false)
const error = ref(null)
const validationErrors = ref({
  email: '',
  password: ''
})
const form = ref({
  email: '',
  password: ''
})

// Handle Google Sign In
const handleGoogleSignIn = async () => {
  loading.value = true
  error.value = null
  try {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' })
  } catch (err) {
    console.error('Google sign-in error:', err)
    error.value = 'Google sign in failed. Please try again.'
  } finally {
    loading.value = false
  }
}

const handleEmailSignup = async () => {
  validationErrors.value.email = ''
  validationErrors.value.password = ''
  error.value = null

  const email = form.value.email.trim()
  const password = form.value.password

  if (!email) {
    validationErrors.value.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    validationErrors.value.email = 'Please enter a valid email address.'
  }

  validationErrors.value.password = validatePassword(password)

  if (validationErrors.value.email || validationErrors.value.password) {
    error.value = 'Please correct the highlighted fields.'
    return
  }

  loading.value = true
  try {
    const result = await authClient.signUp.email({
      email,
      password,
      name: email.split('@')[0],
      callbackURL: `${window.location.origin}/login?verified=1`
    })

    if (result?.error) {
      error.value = result.error.message || 'Sign up failed. Please try again.'
      return
    }

    await router.push(`/login?signup=success&email=${encodeURIComponent(email)}`)
  } catch (err) {
    console.error('Email sign-up error:', err)
    error.value = 'Sign up failed. Please try again.'
  } finally {
    loading.value = false
  }
}

useSeoMeta({
  robots: 'noindex, nofollow'
})
</script>
