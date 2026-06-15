<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-4 py-12">
    <div class="w-full max-w-sm">

      <!-- App connecting banner -->
      <div v-if="clientName" class="flex items-center justify-center gap-3 mb-8">
        <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img v-if="clientIcon" :src="clientIcon" :alt="clientName" class="w-full h-full object-cover" />
          <UIcon v-else name="i-lucide-link" class="w-4 h-4 text-muted" />
        </div>
        <UIcon name="i-lucide-arrow-right-left" class="w-4 h-4 text-dimmed" />
        <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img src="/favicon-96x96.png" alt="KrabiClaw" class="w-full h-full object-cover" />
        </div>
      </div>

      <UCard :ui="{ root: 'shadow-xl' }">
        <template #header>
          <div class="text-center py-1">
            <h1 class="text-xl font-bold text-default">
              {{ existingSession ? 'Connect your account' : 'Sign in to connect' }}
            </h1>
            <p class="text-sm text-muted mt-1">
              <span v-if="clientName">
                <span class="font-semibold text-default">{{ clientName }}</span> is requesting access to KrabiClaw
              </span>
              <span v-else>Sign in to grant access to an external application.</span>
            </p>
          </div>
        </template>

        <!-- Already signed in — confirm account or switch -->
        <div v-if="existingSession" class="space-y-4 py-1">
          <div class="flex items-center gap-3 rounded-xl border border-default bg-elevated px-4 py-3">
            <UAvatar
              :alt="existingSession.name || existingSession.email || ''"
              size="sm"
              class="shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-default truncate">{{ existingSession.name || 'Your account' }}</p>
              <p class="text-xs text-muted truncate">{{ existingSession.email }}</p>
            </div>
            <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-success-500 shrink-0" />
          </div>

          <UButton block size="lg" @click="continueWithSession" :loading="loading">
            Continue as {{ existingSession.name?.split(' ')[0] || 'this account' }}
          </UButton>

          <div class="flex items-center gap-3">
            <div class="flex-1 h-px bg-default" />
            <span class="text-[11px] text-dimmed uppercase tracking-widest">or</span>
            <div class="flex-1 h-px bg-default" />
          </div>

          <button
            class="w-full text-sm text-muted hover:text-default transition-colors text-center"
            @click="switchAccount"
          >
            Sign in with a different account
          </button>
        </div>

        <!-- No session / switch mode — show sign-in options -->
        <div v-else class="space-y-3 py-1">
          <UAlert v-if="error" color="error" variant="soft" :description="error" />

          <!-- Google -->
          <button
            id="oauth-login-google"
            @click="handleGoogleSignIn"
            :disabled="loading"
            class="w-full flex items-center justify-center gap-3 h-11 bg-elevated border border-default rounded-[10px] text-[14px] font-semibold text-default hover:bg-muted transition-colors disabled:opacity-50"
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
            <span class="text-[12px] text-dimmed uppercase tracking-[0.18em]">or</span>
            <div class="flex-1 h-px bg-default" />
          </div>

          <!-- WhatsApp OTP — Step 1 -->
          <div v-if="otpStep === 'phone'" class="space-y-3">
            <UFormField label="WhatsApp number">
              <UInput
                id="oauth-login-phone"
                v-model="phone"
                type="tel"
                placeholder="+1 555 000 0000"
                size="lg"
                color="success"
                class="w-full"
                :disabled="loading"
                @keydown.enter="handleSendOtp"
              />
            </UFormField>
            <UButton
              id="oauth-login-send-otp"
              block
              size="lg"
              color="success"
              variant="solid"
              icon="i-heroicons-chat-bubble-left-ellipsis"
              :loading="loading"
              :disabled="loading || !isPhoneValid"
              @click="handleSendOtp"
            >
              Send code via WhatsApp
            </UButton>
          </div>

          <!-- WhatsApp OTP — Step 2 -->
          <div v-else-if="otpStep === 'code'" class="space-y-3">
            <p class="text-sm text-muted">
              A 6-digit code was sent to <strong class="text-default">{{ phone }}</strong> on WhatsApp.
            </p>
            <UFormField label="Verification code">
              <UInput
                id="oauth-login-otp-code"
                v-model="code"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="123456"
                size="lg"
                color="success"
                class="w-full font-mono tracking-widest text-center"
                :disabled="loading"
                @keydown.enter="handleVerifyOtp"
              />
            </UFormField>
            <UButton
              id="oauth-login-verify-otp"
              block
              size="lg"
              color="success"
              :loading="loading"
              :disabled="code.length < 6"
              @click="handleVerifyOtp"
            >
              Verify and sign in
            </UButton>
            <button
              class="w-full text-sm text-dimmed hover:text-default transition-colors"
              @click="otpStep = 'phone'; code = ''; error = null"
            >
              ← Use a different number
            </button>
          </div>
        </div>

        <template #footer>
          <p class="text-center text-xs text-dimmed">
            You can remove this access at any time from your account settings.
          </p>
        </template>
      </UCard>

      <p class="text-center text-xs text-dimmed mt-6">
        Don't have an account?
        <NuxtLink href="/signup" class="text-default underline underline-offset-2">Sign up</NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: false, auth: false })

useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()

// ── Client metadata ───────────────────────────────────────────────────────────
const clientName = ref('')
const clientIcon = ref(null)

onMounted(async () => {
  // 1. Fetch registered client name / icon for the banner
  const clientId = route.query.client_id
  if (clientId && typeof clientId === 'string') {
    try {
      const data = await $fetch('/api/auth/oauth2/public-client-prelogin', {
        method: 'POST',
        body: { client_id: clientId, oauth_query: window.location.search.slice(1) },
      })
      if (data?.client_name) clientName.value = data.client_name
      if (data?.logo_uri) clientIcon.value = data.logo_uri
    } catch {
      // Non-fatal — fall back to generic copy
    }
  }

  // 2. Check for an existing session — if found, show the confirm-account UI
  try {
    const session = await authClient.getSession()
    if (session?.data?.user) {
      existingSession.value = session.data.user
    }
  } catch {
    // No session — show sign-in options
  }
})

// ── Existing session state ────────────────────────────────────────────────────
const existingSession = ref(null)
const loading = ref(false)

/**
 * User confirms they want to proceed with their current account.
 * Just send them on to the consent page with the same OAuth query intact.
 */
function continueWithSession() {
  loading.value = true
  // Better Auth's oauthProvider redirects /oauth/login?<query> → /oauth/consent?<query>
  // after confirming an active session. We replicate that by navigating to consent directly.
  const consentUrl = `/oauth/consent${window.location.search}`
  window.location.href = consentUrl
}

/**
 * User wants to sign in as a different account — sign out silently and show
 * the sign-in form.
 */
async function switchAccount() {
  try {
    await authClient.signOut()
  } catch {
    // Ignore sign-out errors
  }
  existingSession.value = null
}

// ── Sign-in options (no existing session) ────────────────────────────────────
const error = ref(null)

// Must be absolute: Better Auth validates relative callbackURLs with a regex that rejects `:`, which
// appears when redirect_uri is unencoded. Absolute URLs are validated by origin only, not query string.
const oauthCallbackUrl = computed(() =>
  typeof window !== 'undefined'
    ? `${window.location.origin}/oauth/consent${window.location.search}`
    : ''
)

const handleGoogleSignIn = async () => {
  loading.value = true
  error.value = null
  try {
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: oauthCallbackUrl.value,
    })
  } catch {
    error.value = 'Google sign in failed. Please try again.'
    loading.value = false
  }
}

// WhatsApp OTP
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
      callbackURL: oauthCallbackUrl.value,
    })
    window.location.href = oauthCallbackUrl.value
  } catch (err) {
    error.value = err?.message ?? 'Invalid or expired code. Please try again.'
    code.value = ''
  } finally {
    loading.value = false
  }
}
</script>
