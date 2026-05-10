<template>
  <div class="min-h-screen bg-(--ui-bg-muted)">
    <div class="max-w-md mx-auto pt-16 pb-12 px-4">
      <!-- KrabiClaw Branding -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-(--ui-text-highlighted) mb-2">
          KrabiClaw
        </h1>
        <p class="text-(--ui-text-muted)">
          Sign in to your restaurant website dashboard
        </p>
      </div>

      <!-- Login Card -->
      <div class="bg-(--ui-bg) rounded-xl shadow-sm border border-(--ui-border) p-8">
        <h2 class="text-xl font-semibold text-(--ui-text-highlighted) mb-6">
          Sign In
        </h2>

        <!-- Error message -->
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :description="error"
          class="mb-4"
        />

        <div class="space-y-4">
          <!-- Google Sign In -->
          <button
            @click="handleGoogleSignIn"
            :disabled="loading"
            class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-(--ui-border) rounded-lg hover:bg-(--ui-bg-muted) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span class="text-stone-700 font-medium">Continue with Google</span>
          </button>

          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-(--ui-border)"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-(--ui-bg) text-(--ui-text-muted)">or</span>
            </div>
          </div>

          <!-- WhatsApp OTP — Step 1: enter phone -->
          <div v-if="otpStep === 'phone'" class="space-y-3">
            <UFormField label="WhatsApp number">
              <UInput
                v-model="phone"
                type="tel"
                placeholder="+1 555 000 0000"
                size="lg"
                class="w-full"
                :disabled="loading"
                @keydown.enter="handleSendOtp"
              />
            </UFormField>
            <UButton
              block
              size="lg"
              color="neutral"
              variant="outline"
              icon="i-heroicons-chat-bubble-left-ellipsis"
              :loading="loading"
              :disabled="!phone.trim()"
              @click="handleSendOtp"
            >
              Send code via WhatsApp
            </UButton>
          </div>

          <!-- WhatsApp OTP — Step 2: enter code -->
          <div v-else-if="otpStep === 'code'" class="space-y-3">
            <p class="text-sm text-(--ui-text-muted)">
              A 6-digit code was sent to <strong class="text-(--ui-text-highlighted)">{{ phone }}</strong> on WhatsApp.
            </p>
            <UFormField label="Verification code">
              <UInput
                v-model="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="123456"
                size="lg"
                class="w-full font-mono tracking-widest text-center"
                :disabled="loading"
                @keydown.enter="handleVerifyOtp"
              />
            </UFormField>
            <UButton
              block
              size="lg"
              :loading="loading"
              :disabled="code.length < 6"
              @click="handleVerifyOtp"
            >
              Verify and sign in
            </UButton>
            <button
              class="w-full text-sm text-(--ui-text-muted) hover:text-(--ui-text-highlighted) transition-colors"
              @click="otpStep = 'phone'; code = ''; error = null"
            >
              ← Use a different number
            </button>
          </div>
        </div>

        <!-- Sign Up Link -->
        <div class="mt-6 text-center text-sm text-(--ui-text-muted)">
          Don't have an account?
          <NuxtLink to="/signup" class="text-(--ui-text-highlighted) hover:underline font-medium">
            Start free
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'platform' })

const router = useRouter()
const loading = ref(false)
const error = ref(null)

// Google
const handleGoogleSignIn = async () => {
  loading.value = true
  error.value = null
  try {
    await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' })
  } catch (err) {
    error.value = 'Google sign in failed. Please try again.'
  } finally {
    loading.value = false
  }
}

// WhatsApp OTP
const otpStep = ref('phone') // 'phone' | 'code'
const phone = ref('')
const code = ref('')

const handleSendOtp = async () => {
  if (!phone.value.trim()) return
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
    await authClient.phoneNumber.signIn({
      phoneNumber: phone.value.trim(),
      code: code.value.trim(),
      callbackURL: '/dashboard',
    })
    router.push('/dashboard')
  } catch (err) {
    error.value = err?.message ?? 'Invalid or expired code. Please try again.'
    code.value = ''
  } finally {
    loading.value = false
  }
}
</script>
