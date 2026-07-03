<template>
  <div class="min-h-screen flex items-center justify-center bg-(--ui-bg) px-4 py-12">
    <div class="w-full max-w-sm">

      <!-- App connecting banner -->
      <div v-if="clientName" class="flex items-center justify-center gap-3 mb-8">
        <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img v-if="clientIcon" :src="clientIcon" :alt="clientName" class="w-full h-full object-cover" />
          <SayaIcon v-else name="link" class="w-4 h-4 text-muted" />
        </div>
        <SayaIcon name="arrow-right-left" class="w-4 h-4 text-dimmed" />
        <div class="w-9 h-9 rounded-xl overflow-hidden bg-elevated border border-default flex items-center justify-center shrink-0">
          <img src="/favicon-96x96.png" alt="KrabiClaw" class="w-full h-full object-cover" />
        </div>
      </div>

      <div class="rounded-lg border border-default bg-default shadow-xl">
        <div class="border-b border-default px-6 py-5">
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
        </div>

        <div class="px-6 py-5">
          <!-- Already signed in — confirm account or switch -->
          <div v-if="existingSession" class="space-y-4 py-1">
            <div class="flex items-center gap-3 rounded-xl border border-default bg-elevated px-4 py-3">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-default">
                {{ accountInitial }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-default truncate">{{ existingSession.name || 'Your account' }}</p>
                <p class="text-xs text-muted truncate">{{ existingSession.email }}</p>
              </div>
              <SayaIcon name="check-circle" class="w-4 h-4 text-green-500 shrink-0" />
            </div>

            <PlatformButton block :loading="loading" @click="continueWithSession">
              Continue as {{ existingSession.name?.split(' ')[0] || 'this account' }}
            </PlatformButton>

            <div class="flex items-center gap-3">
              <div class="flex-1 h-px bg-default" />
              <span class="text-[11px] text-dimmed uppercase tracking-widest">or</span>
              <div class="flex-1 h-px bg-default" />
            </div>

            <PlatformButton variant="ghost" size="sm" block @click="switchAccount">
              Sign in with a different account
            </PlatformButton>
          </div>

          <!-- No session / switch mode — show sign-in options -->
          <div v-else class="space-y-3 py-1">
            <div v-if="error" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>

            <!-- Google -->
            <PlatformButton id="oauth-login-google" variant="outline" size="lg" block :loading="loading" @click="handleGoogleSignIn">
              <PlatformGoogleIcon class="w-5 h-5" />
              Continue with Google
            </PlatformButton>

            <!-- Divider -->
            <div class="flex items-center gap-3 py-1">
              <div class="flex-1 h-px bg-default" />
              <span class="text-[12px] text-dimmed uppercase tracking-[0.18em]">or</span>
              <div class="flex-1 h-px bg-default" />
            </div>

            <!-- WhatsApp OTP — Step 1 -->
            <div v-if="otpStep === 'phone'" class="space-y-3">
              <SayaFormField v-slot="{ id }" label="WhatsApp number" name="oauth-phone">
                <input
                  :id="id"
                  v-model="phone"
                  type="tel"
                  placeholder="+1 555 000 0000"
                  :disabled="loading"
                  :class="inputClass"
                  @keydown.enter="handleSendOtp"
                />
              </SayaFormField>
              <button
                id="oauth-login-send-otp"
                type="button"
                :disabled="loading || !isPhoneValid"
                class="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                @click="handleSendOtp"
              >
                <SayaIcon :name="loading ? 'arrow-path' : 'chat-bubble-left-ellipsis'" :class="['size-4', loading && 'animate-spin']" />
                Send code via WhatsApp
              </button>
            </div>

            <!-- WhatsApp OTP — Step 2 -->
            <div v-else-if="otpStep === 'code'" class="space-y-3">
              <p class="text-sm text-muted">
                A 6-digit code was sent to <strong class="text-default">{{ phone }}</strong> on WhatsApp.
              </p>
              <SayaFormField v-slot="{ id }" label="Verification code" name="oauth-code">
                <input
                  :id="id"
                  v-model="code"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="123456"
                  :disabled="loading"
                  :class="[inputClass, 'font-mono tracking-widest text-center']"
                  @keydown.enter="handleVerifyOtp"
                />
              </SayaFormField>
              <button
                id="oauth-login-verify-otp"
                type="button"
                :disabled="code.length < 6 || loading"
                class="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                @click="handleVerifyOtp"
              >
                <SayaIcon v-if="loading" name="arrow-path" class="size-4 animate-spin" />
                Verify and sign in
              </button>
              <PlatformButton variant="ghost" size="sm" block @click="otpStep = 'phone'; code = ''; error = null">
                ← Use a different number
              </PlatformButton>
            </div>
          </div>
        </div>

        <div class="border-t border-default px-6 py-4">
          <p class="text-center text-xs text-dimmed">
            You can remove this access at any time from your account settings.
          </p>
        </div>
      </div>

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

import { FORM_INPUT_CLASS } from '~/utils/form-constants'

// Plain-Tailwind form styling — replaces UInput's default look now that this
// page no longer depends on Nuxt UI (see SayaFormField.vue).
const inputClass = FORM_INPUT_CLASS

const route = useRoute()
const oauthPrompt = computed(() =>
  typeof route.query.prompt === 'string' ? route.query.prompt : ''
)
const isSelectAccountFlow = computed(() =>
  oauthPrompt.value.split(' ').includes('select_account')
)

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
const accountInitial = computed(() =>
  (existingSession.value?.name || existingSession.value?.email || '?').charAt(0).toUpperCase()
)

/**
 * User confirms they want to proceed with their current account.
 * Route back through the authorize endpoint so Better Auth can re-run the
 * prompt/consent checks with the now-active session (skips consent page when
 * skipConsent=true or consent is already saved, handles prompt=consent correctly).
 */
function continueWithSession() {
  loading.value = true
  if (isSelectAccountFlow.value) {
    $fetch('/api/auth/oauth2/continue', {
      method: 'POST',
      body: { selected: true },
    })
      .then((result) => {
        if (result?.url) {
          window.location.href = result.url
          return
        }
        window.location.href = `/api/auth/oauth2/authorize${window.location.search}`
      })
      .catch(() => {
        window.location.href = `/api/auth/oauth2/authorize${window.location.search}`
      })
    return
  }

  window.location.href = `/api/auth/oauth2/authorize${window.location.search}`
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
