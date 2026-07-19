<template>
  <div>
    <h1 class="text-4xl font-extrabold tracking-tight text-default">Welcome back</h1>
    <p class="mt-2 mb-7 text-sm text-muted">Sign in to continue.</p>

    <div v-if="notice" role="status" class="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">{{ notice }}</div>
    <div v-if="operationError" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ operationError }}</div>

    <AuthPhoneOtpForm v-if="isWhatsAppMode" default-country="TH" @verified="finishPhoneSignIn" />

    <div v-else class="space-y-3">
      <AuthGoogleAuthButton :loading="googleLoading" @activate="signInWithGoogle(postLoginUrl)" />
      <div class="flex items-center gap-3 py-1">
        <div class="h-px flex-1 bg-default" /><span class="text-xs uppercase tracking-widest text-dimmed">or</span><div class="h-px flex-1 bg-default" />
      </div>
      <AuthEmailSignInForm :callback-url="postLoginUrl" :initial-email="queryEmail" @verification-required="showVerification" />
      <PlatformButton variant="outline" size="lg" block @click="showPhone = !showPhone">Continue with WhatsApp</PlatformButton>
      <AuthPhoneOtpForm v-if="showPhone" default-country="TH" @verified="finishPhoneSignIn" />

      <div v-if="verificationEmail" class="rounded-xl border border-default p-3 space-y-2">
        <p class="text-sm text-muted">Verify your email before signing in.</p>
        <PlatformButton variant="outline" block :loading="resending" @click="resendVerification">Resend verification</PlatformButton>
      </div>
    </div>

    <p v-if="!isWhatsAppMode" class="mt-6 text-center text-sm text-muted">New to KrabiClaw? <NuxtLink to="/signup" class="font-semibold text-primary">Create an account</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { buildPostLoginUrl, validatedInternalPath } from '~/shared/auth/return-target'

definePageMeta({ layout: 'access', auth: false })
useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()
const queryEmail = typeof route.query.email === 'string' ? route.query.email : ''
const isWhatsAppMode = computed(() => route.query.mode === 'whatsapp')
const postLoginUrl = computed(() => buildPostLoginUrl({ redirect: validatedInternalPath(route.query.redirect) }))
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
