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
          <p class="text-[15px] text-muted mb-7">{{ isOAuthFlow ? 'Sign in to grant access to an external application.' : 'Sign in to manage your local business.' }}</p>

          <div v-if="notice" role="status" class="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">{{ notice }}</div>
          <div v-if="error" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>

          <div class="space-y-3">
            <!-- Google -->
            <PlatformButton variant="outline" size="lg" block :loading="loading" @click="handleGoogleSignIn">
              <PlatformGoogleIcon class="w-5 h-5" />
              Continue with Google
            </PlatformButton>

            <!-- WhatsApp OTP — Step 1 -->
            <PlatformButton v-if="otpStep === 'phone'" variant="outline" size="lg" block @click="otpStep = 'number'">
              <SayaIcon name="chat-bubble-left-ellipsis" class="size-5" />
              Continue with WhatsApp
            </PlatformButton>

            <!-- WhatsApp OTP — Step 1b: phone entry -->
            <div v-else-if="otpStep === 'number'" class="space-y-3">
              <SayaFormField v-slot="{ id }" label="WhatsApp number" name="phone">
                <input :id="id" v-model="phone" type="tel" placeholder="+1 555 000 0000" :disabled="loading" :class="inputClass" @keydown.enter="handleSendOtp" />
              </SayaFormField>
              <div class="flex gap-2">
                <PlatformButton variant="outline" @click="otpStep = 'phone'; phone = ''; error = null">
                  ← Back
                </PlatformButton>
                <PlatformButton class="flex-1" :disabled="!isPhoneValid" :loading="loading" @click="handleSendOtp">
                  Send code via WhatsApp
                </PlatformButton>
              </div>
            </div>

            <!-- WhatsApp OTP — Step 2 -->
            <div v-else-if="otpStep === 'code'" class="space-y-3">
              <p class="text-sm text-muted">
                A 6-digit code was sent to <strong class="text-default">{{ phone }}</strong> on WhatsApp.
              </p>
              <SayaFormField v-slot="{ id }" label="Verification code" name="code">
                <input :id="id" v-model="code" type="text" inputmode="numeric" maxlength="6" placeholder="123456" :disabled="loading" :class="[inputClass, 'font-mono tracking-widest text-center']" @keydown.enter="handleVerifyOtp" />
              </SayaFormField>
              <PlatformButton block :disabled="code.length < 6" :loading="loading" @click="handleVerifyOtp">
                Verify and sign in
              </PlatformButton>
              <PlatformButton variant="ghost" size="sm" block @click="otpStep = 'phone'; code = ''; error = null">
                ← Use a different number
              </PlatformButton>
            </div>

            <!-- Divider -->
            <div class="flex items-center gap-3 py-1">
              <div class="flex-1 h-px bg-default" />
              <span class="text-[12px] text-dimmed uppercase tracking-[0.18em]">or continue with email</span>
              <div class="flex-1 h-px bg-default" />
            </div>

            <form class="space-y-3" @submit.prevent="handleEmailSignIn">
              <SayaFormField v-slot="{ id }" label="Email" name="login-email">
                <input :id="id" v-model="emailForm.email" type="email" placeholder="you@example.com" :disabled="loading" autocomplete="email" :class="inputClass" />
              </SayaFormField>
              <SayaFormField v-slot="{ id }" label="Password" name="login-password">
                <input :id="id" v-model="emailForm.password" type="password" placeholder="••••••••" :disabled="loading" autocomplete="current-password" :class="inputClass" />
              </SayaFormField>
              <div class="flex items-center justify-between gap-3 text-sm">
                <NuxtLink to="/forgot-password" class="text-primary font-medium hover:underline no-underline">
                  Forgot password?
                </NuxtLink>
                <PlatformButton type="submit" :loading="loading">
                  Sign in with email
                </PlatformButton>
              </div>
            </form>

            <div v-if="showResendVerification" class="rounded-xl border border-default/60 bg-elevated/60 p-3 space-y-2">
              <p class="text-sm text-muted">Need to verify your email before signing in?</p>
              <SayaFormField v-slot="{ id }" label="Email address" name="verification-email">
                <input :id="id" v-model="verificationEmail" type="email" placeholder="Enter your account email" :disabled="loading || resendingVerification" :class="inputClass" />
              </SayaFormField>
              <PlatformButton variant="outline" :loading="resendingVerification" :disabled="loading" block @click="handleResendVerification">
                Resend verification
              </PlatformButton>
            </div>
          </div>
        </div>
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

const route = useRoute()
const isOAuthFlow = computed(() => !!route.query.client_id)
const postLoginUrl = computed(() => {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    ? `/api/post-login?redirect=${encodeURIComponent(redirect)}`
    : '/api/post-login'
})

const loading = ref(false)
const error = ref(null)
const notice = ref(null)
const resendingVerification = ref(false)
const showResendVerification = ref(false)
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
  if (session?.data?.user) window.location.href = postLoginUrl.value
})

const handleGoogleSignIn = async () => {
  loading.value = true
  error.value = null
  try {
    await authClient.signIn.social({ provider: 'google', callbackURL: postLoginUrl.value })
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
  showResendVerification.value = false

  try {
    const result = await authClient.signIn.email({
      email,
      password,
      rememberMe: false,
    })

    if (result?.error) {
      error.value = result.error.message ?? 'Email sign in failed. Please try again.'
      if (result.error.code === 'EMAIL_NOT_VERIFIED') {
        verificationEmail.value = email
        showResendVerification.value = true
      }
      return
    }

    window.location.href = postLoginUrl.value
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

function normalizePhone(value) {
  return value.trim().replace(/[\s\-\(\)]/g, '')
}

const isPhoneValid = computed(() => {
  const value = normalizePhone(phone.value)
  if (!value) return false
  return /^\+?[1-9]\d{1,14}$/.test(value)
})

const handleSendOtp = async () => {
  if (!isPhoneValid.value) {
    error.value = 'Please enter a valid phone number'
    return
  }
  loading.value = true
  error.value = null
  try {
    await authClient.phoneNumber.sendOtp({ phoneNumber: normalizePhone(phone.value) })
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
      phoneNumber: normalizePhone(phone.value),
      code: code.value.trim(),
      callbackURL: postLoginUrl.value,
    })
    window.location.href = postLoginUrl.value
  } catch (err) {
    error.value = err?.message ?? 'Invalid or expired code. Please try again.'
    code.value = ''
  } finally {
    loading.value = false
  }
}
</script>
