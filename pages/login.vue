<template>
  <div class="flex-1 grid lg:grid-cols-2">

    <!-- Mascot side -->
    <aside class="hidden lg:flex flex-col items-center justify-center bg-(--kc-coral-50) px-12 py-12">
      <img src="/krabiclaw-login-mascot.png" alt="" class="w-full max-w-115 block" />
      <p class="text-[14px] text-muted text-center max-w-sm mt-5 leading-relaxed">
        "We launched our menu in 12 minutes and got our first online reservation the same night." —
        <strong class="text-default">Saya, Kikuzuki Krabi</strong>
      </p>
    </aside>

    <!-- Form side -->
    <div class="flex items-center justify-center px-8 py-12">
        <div class="w-full max-w-105">
          <h1 class="text-[36px] font-extrabold tracking-tight text-default m-0 mb-2">{{ isOAuthFlow ? 'Connect your account' : 'Welcome back' }}</h1>
          <p class="text-[15px] text-muted mb-7">{{ isOAuthFlow ? 'Sign in to grant access to an external application.' : 'Sign in to manage your restaurant.' }}</p>

          <UAlert v-if="notice" color="success" variant="soft" :description="notice" class="mb-4" />
          <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

          <div class="space-y-3">
            <!-- Google -->
            <UButton
              @click="handleGoogleSignIn"
              :disabled="loading"
              :loading="loading"
              color="neutral"
              variant="outline"
              size="lg"
              block
              class="h-11.5"
            >
              <template #leading>
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </template>
              Continue with Google
            </UButton>

            <!-- Divider -->
            <div class="flex items-center gap-3 py-1">
              <div class="flex-1 h-px bg-default" />
              <span class="text-[12px] text-dimmed uppercase tracking-[0.18em]">or continue with</span>
              <div class="flex-1 h-px bg-default" />
            </div>

            <form class="space-y-3" @submit.prevent="handleEmailSignIn">
              <UFormField label="Email">
                <UInput v-model="emailForm.email" type="email" placeholder="you@example.com" size="lg" class="w-full" :disabled="loading" autocomplete="email" />
              </UFormField>
              <UFormField label="Password">
                <UInput v-model="emailForm.password" type="password" placeholder="••••••••" size="lg" class="w-full" :disabled="loading" autocomplete="current-password" />
              </UFormField>
              <div class="flex items-center justify-between gap-3 text-sm">
                <NuxtLink to="/forgot-password" class="text-primary font-medium hover:underline no-underline">
                  Forgot password?
                </NuxtLink>
                <UButton type="submit" size="lg" :loading="loading">
                  Sign in with email
                </UButton>
              </div>
            </form>

            <div class="rounded-xl border border-default/60 bg-elevated/60 p-3 space-y-2">
              <p class="text-sm text-muted">Need to verify your email before signing in?</p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <UInput v-model="verificationEmail" type="email" placeholder="Enter your account email" class="flex-1" :disabled="loading || resendingVerification" />
                <UButton color="neutral" variant="soft" :loading="resendingVerification" @click="handleResendVerification">
                  Resend verification
                </UButton>
              </div>
            </div>

            <!-- WhatsApp OTP — Step 1 -->
            <div v-if="otpStep === 'phone'" class="space-y-3">
              <UFormField label="WhatsApp number">
                <UInput v-model="phone" type="tel" placeholder="+1 555 000 0000" size="lg" color="success" class="w-full" :disabled="loading" @keydown.enter="handleSendOtp" />
              </UFormField>
              <UButton block size="lg" color="success" variant="solid" icon="i-heroicons-chat-bubble-left-ellipsis" :loading="loading" :disabled="loading || !isPhoneValid" @click="handleSendOtp">
                Send code via WhatsApp
              </UButton>
            </div>

            <!-- WhatsApp OTP — Step 2 -->
            <div v-else-if="otpStep === 'code'" class="space-y-3">
              <p class="text-sm text-muted">
                A 6-digit code was sent to <strong class="text-default">{{ phone }}</strong> on WhatsApp.
              </p>
              <UFormField label="Verification code">
                <UInput v-model="code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" size="lg" color="success" class="w-full font-mono tracking-widest text-center" :disabled="loading" @keydown.enter="handleVerifyOtp" />
              </UFormField>
              <UButton block size="lg" color="success" :loading="loading" :disabled="code.length < 6" @click="handleVerifyOtp">
                Verify and sign in
              </UButton>
              <UButton variant="ghost" color="neutral" size="sm" block @click="otpStep = 'phone'; code = ''; error = null">
                ← Use a different number
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'platform', auth: false })

import { authClient } from '~/lib/auth-client'

useSeoMeta({
  robots: 'noindex, nofollow'
})

const route = useRoute()
const isOAuthFlow = computed(() => !!route.query.client_id)

const loading = ref(false)
const error = ref(null)
const notice = ref(null)
const resendingVerification = ref(false)
const queryEmail = typeof route.query.email === 'string' ? route.query.email : ''
const emailForm = ref({
  email: queryEmail,
  password: ''
})
const verificationEmail = ref(queryEmail)

if (route.query.signup === 'success') {
  notice.value = queryEmail
    ? `We sent a verification email to ${queryEmail}. Verify your email, then sign in here.`
    : 'We sent a verification email. Verify your email, then sign in here.'
} else if (route.query.verified === '1') {
  notice.value = 'Your email is verified. You can sign in now.'
} else if (route.query.reset === 'success') {
  notice.value = 'Your password was updated. Sign in with your new password.'
}

onMounted(async () => {
  const session = await authClient.getSession()
  if (session?.data?.user) window.location.href = '/api/post-login'
})

const handleGoogleSignIn = async () => {
  loading.value = true
  error.value = null
  try {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/api/post-login' })
  } catch {
    error.value = 'Google sign in failed. Please try again.'
  } finally {
    loading.value = false
  }
}

const handleEmailSignIn = async () => {
  const email = emailForm.value.email.trim()
  const password = emailForm.value.password

  if (!email || !password) {
    error.value = 'Enter your email and password to sign in.'
    return
  }

  loading.value = true
  error.value = null
  notice.value = null
  verificationEmail.value = email

  try {
    const result = await authClient.signIn.email({
      email,
      password,
      rememberMe: false,
    })

    if (result?.error) {
      error.value = result.error.message ?? 'Email sign in failed. Please try again.'
      return
    }

    window.location.href = '/api/post-login'
  } catch (err) {
    error.value = err?.message ?? 'Email sign in failed. Please try again.'
  } finally {
    loading.value = false
  }
}

const handleResendVerification = async () => {
  const email = verificationEmail.value.trim()
  if (!email) {
    error.value = 'Enter your email address to resend verification.'
    return
  }

  resendingVerification.value = true
  error.value = null
  notice.value = null

  try {
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: `${window.location.origin}/login?verified=1`,
    })

    if (result?.error) {
      error.value = result.error.message ?? 'Could not resend verification email.'
      return
    }

    notice.value = `If ${email} is registered, a fresh verification email is on the way.`
  } catch (err) {
    error.value = err?.message ?? 'Could not resend verification email.'
  } finally {
    resendingVerification.value = false
  }
}

const otpStep = ref('phone')
const phone = ref('')
const code = ref('')

const isPhoneValid = computed(() => {
  const value = phone.value.trim()
  if (!value) return false
  return /^\+?[1-9]\d{1,14}$/.test(value.replace(/[\s\-\(\)]/g, ''))
})

const handleSendOtp = async () => {
  if (!isPhoneValid.value) {
    error.value = 'Please enter a valid phone number'
    return
  }
  loading.value = true
  error.value = null
  try {
    await authClient.phoneNumber.sendOtp({ phoneNumber: phone.value.trim() })
    otpStep.value = 'code'
  } catch (err) {
    error.value = err?.message ?? 'Failed to send code. Check your number and try again.'
  } finally {
    loading.value = false
  }
}

const handleVerifyOtp = async () => {
  if (code.value.length < 6) return
  loading.value = true
  error.value = null
  try {
    await authClient.phoneNumber.verify({
      phoneNumber: phone.value.trim(),
      code: code.value.trim(),
      callbackURL: '/api/post-login',
    })
    window.location.href = '/api/post-login'
  } catch (err) {
    error.value = err?.message ?? 'Invalid or expired code. Please try again.'
    code.value = ''
  } finally {
    loading.value = false
  }
}
</script>
