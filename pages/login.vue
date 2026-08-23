<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Sign in</h1>

    <UAlert v-if="notice" color="success" variant="soft" :description="notice" class="mt-4" />
    <UAlert v-if="operationError" color="error" variant="soft" :description="operationError" class="mt-4" />

    <AuthPhoneOtpForm v-if="isWhatsAppMode" default-country="TH" class="mt-6" @verified="finishPhoneSignIn" />

    <div v-else class="mt-6 space-y-3">
      <AuthGoogleAuthButton :loading="googleLoading" @activate="signInWithGoogle(postLoginUrl)" />
      <WhatsAppAuthButton @activate="showPhone = !showPhone" />
      <AuthPhoneOtpForm v-if="showPhone" default-country="TH" @verified="finishPhoneSignIn" />
      <USeparator label="or" />
      <AuthEmailSignInForm :callback-url="postLoginUrl" :initial-email="queryEmail" @verification-required="showVerification" />

      <UAlert v-if="verificationEmail" color="neutral" variant="soft" description="Verify your email before signing in.">
        <template #actions>
          <UButton variant="outline" :loading="resending" @click="resendVerification">Resend verification</UButton>
        </template>
      </UAlert>
    </div>

    <p v-if="!isWhatsAppMode" class="mt-6 text-center text-sm text-muted">Don't have an account? <NuxtLink :to="signupUrl" class="font-semibold text-primary">Sign up</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
import WhatsAppAuthButton from '~/components/auth/WhatsAppAuthButton.vue'
import { authClient } from '~/lib/auth-client'
import { buildPostLoginUrl, validatedInternalPath } from '~/shared/auth/return-target'

definePageMeta({ layout: 'access', auth: false })
useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()
const queryEmail = typeof route.query.email === 'string' ? route.query.email : ''
const isWhatsAppMode = computed(() => route.query.mode === 'whatsapp')
const redirect = computed(() => validatedInternalPath(route.query.redirect))
const postLoginUrl = computed(() => buildPostLoginUrl({ redirect: redirect.value }))
const signupUrl = computed(() => redirect.value ? { path: '/signup', query: { redirect: redirect.value } } : '/signup')
const showPhone = ref(false)
const verificationEmail = ref('')
const resending = ref(false)
const notice = ref<string | null>(null)
const operationError = ref<string | null>(null)
const { loading: googleLoading, error: googleError, signInWithGoogle } = useAuthOperation()
watch(googleError, value => { operationError.value = value })

if (route.query.signup === 'success') notice.value = queryEmail ? `Check ${queryEmail} to verify your email.` : 'Check your email to verify your account.'
else if (route.query.verified === '1') notice.value = 'Your email is verified. You can sign in now.'
else if (route.query.reset === 'success') notice.value = 'Your password was updated. Sign in with your new password.'

const { isAuthenticated } = await useAuthSession()
if (isAuthenticated.value) await navigateTo(postLoginUrl.value, { external: true })

function finishPhoneSignIn() {
  window.location.href = postLoginUrl.value
}

function showVerification(email: string) {
  verificationEmail.value = email
}

async function resendVerification() {
  if (!verificationEmail.value || resending.value) return
  resending.value = true
  operationError.value = null
  try {
    const result = await authClient.sendVerificationEmail({ email: verificationEmail.value, callbackURL: `${window.location.origin}/login?verified=1` })
    if (result?.error) operationError.value = result.error.message || 'Could not resend verification email.'
    else notice.value = `If ${verificationEmail.value} is registered, a fresh verification email is on the way.`
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : 'Could not resend verification email.'
  } finally {
    resending.value = false
  }
}
</script>
