<template>
  <div v-if="!isAuthenticated">
    <!-- Signing up by email used to push back to /login with a small alert, so
         the page looked unchanged and owners retried the form. Verification is
         its own step, so it gets its own screen. -->
    <div v-if="pendingEmail" class="text-center">
      <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UIcon name="i-lucide-mail-check" class="size-7" />
      </div>
      <h1 class="mt-5 text-2xl font-semibold tracking-tight text-highlighted">Check your email</h1>
      <p class="mt-3 text-sm leading-relaxed text-muted">
        We sent a verification link to <span class="font-semibold text-default">{{ pendingEmail }}</span>.
        Open it to finish setting up your account.
      </p>

      <UAlert v-if="resendNotice" color="success" variant="soft" :description="resendNotice" class="mt-5 text-left" />
      <UAlert v-if="resendError" color="error" variant="soft" :description="resendError" class="mt-5 text-left" />

      <div class="mt-7 space-y-3">
        <UButton color="neutral" variant="outline" size="lg" block :loading="resending" @click="resendVerification">
          Resend the email
        </UButton>
        <UButton block color="neutral" variant="ghost" size="sm" @click="useDifferentEmail">
          Use a different email address
        </UButton>
      </div>
      <p class="mt-6 text-sm text-muted">Already verified? <NuxtLink :to="loginUrl" class="font-semibold text-primary">Sign in</NuxtLink></p>
    </div>

    <div v-else>
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Create your account</h1>

    <UAlert v-if="error" color="error" variant="soft" :description="error" class="mt-4" />

    <div class="mt-6 space-y-3">
      <AuthGoogleButton label="Sign up with Google" :loading="loading" @activate="googleSignup" />
      <AuthWhatsAppButton label="Sign up with WhatsApp" :disabled="loading" @activate="showPhone = !showPhone" />
      <AuthPhoneOtpForm v-if="showPhone" default-country="TH" verify-label="Continue with WhatsApp" @verified="whatsAppSignupComplete" />
      <USeparator label="or use email" />
      <AuthEmailSignUpForm :callback-url="verificationCallback" @success="emailSignupComplete" />
    </div>
    <p class="mt-6 text-center text-sm text-muted">Already have an account? <NuxtLink :to="loginUrl" class="font-semibold text-primary">Sign in</NuxtLink></p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NON_INDEXABLE_ROBOTS_INTENT } from '~/shared/robots-directive'
import { authClient } from '~/lib/auth-client'
import { buildPostLoginUrl, validatedInternalPath } from '~/shared/auth/return-target'

definePageMeta({ layout: 'access', auth: false })
useSocialMetadata({
  template: 'platform',
  schema: false,
  path: '/signup',
  title: 'Create your account',
  description: 'Create a free KrabiClaw account and build your business site through ChatGPT.',
  robots: NON_INDEXABLE_ROBOTS_INTENT,
})

const route = useRoute()
const { trackSignUp } = useAnalytics()
const redirect = computed(() => validatedInternalPath(route.query.redirect))
const postLoginUrl = computed(() => buildPostLoginUrl({ redirect: redirect.value }))
const loginUrl = computed(() => redirect.value ? { path: '/login', query: { redirect: redirect.value } } : '/login')
const requestUrl = useRequestURL()
const verificationCallback = computed(() => {
  const url = new URL('/login', requestUrl.origin)
  url.searchParams.set('verified', '1')
  if (redirect.value) url.searchParams.set('redirect', redirect.value)
  return url.toString()
})
const { loading, error, signInWithGoogle } = useAuthOperation()
const showPhone = ref(false)
const pendingEmail = ref('')
const resending = ref(false)
const resendNotice = ref<string | null>(null)
const resendError = ref<string | null>(null)

const { isAuthenticated } = await useAuthSession()
if (isAuthenticated.value) await navigateTo(postLoginUrl.value, { external: true })

async function googleSignup() {
  await signInWithGoogle(postLoginUrl.value)
  if (!error.value) trackSignUp('oauth_google')
}

async function emailSignupComplete(email: string) {
  trackSignUp('email')
  pendingEmail.value = email
}

function useDifferentEmail() {
  pendingEmail.value = ''
  resendNotice.value = null
  resendError.value = null
}

async function resendVerification() {
  if (!pendingEmail.value || resending.value) return
  resending.value = true
  resendNotice.value = null
  resendError.value = null
  try {
    const result = await authClient.sendVerificationEmail({ email: pendingEmail.value, callbackURL: verificationCallback.value })
    if (result?.error) resendError.value = result.error.message || 'Could not resend the verification email.'
    else resendNotice.value = `If ${pendingEmail.value} is registered, another verification email is on the way.`
  } catch (resendFailure) {
    resendError.value = resendFailure instanceof Error ? resendFailure.message : 'Could not resend the verification email.'
  } finally {
    resending.value = false
  }
}

function whatsAppSignupComplete() {
  trackSignUp('whatsapp')
  window.location.href = postLoginUrl.value
}
</script>
