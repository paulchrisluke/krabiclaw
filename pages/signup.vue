<template>
  <div>
    <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Create your account</h1>

    <UAlert v-if="error" color="error" variant="soft" :description="error" class="mt-4" />

    <div class="mt-6 space-y-3">
      <AuthGoogleAuthButton :loading="loading" @activate="googleSignup" />
      <WhatsAppAuthButton :disabled="loading" @activate="showPhone = !showPhone" />
      <AuthPhoneOtpForm v-if="showPhone" default-country="TH" verify-label="Continue with WhatsApp" @verified="whatsAppSignupComplete" />
      <USeparator label="or use email" />
      <AuthEmailSignUpForm :callback-url="verificationCallback" @success="emailSignupComplete" />
    </div>
    <p class="mt-6 text-center text-sm text-muted">Already have an account? <NuxtLink :to="loginUrl" class="font-semibold text-primary">Sign in</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
import WhatsAppAuthButton from '~/components/auth/WhatsAppAuthButton.vue'
import { buildPostLoginUrl, validatedInternalPath } from '~/shared/auth/return-target'

definePageMeta({ layout: 'access', auth: false })
useSeoMeta({ robots: 'noindex, nofollow' })

const route = useRoute()
const router = useRouter()
const { trackSignUp } = useAnalytics()
const redirect = computed(() => validatedInternalPath(route.query.redirect))
const postLoginUrl = computed(() => buildPostLoginUrl({ redirect: redirect.value }))
const loginUrl = computed(() => redirect.value ? { path: '/login', query: { redirect: redirect.value } } : '/login')
const verificationCallback = computed(() => {
  const url = new URL('/login', useRequestURL().origin)
  url.searchParams.set('verified', '1')
  if (redirect.value) url.searchParams.set('redirect', redirect.value)
  return url.toString()
})
const { loading, error, signInWithGoogle } = useAuthOperation()
const showPhone = ref(false)

async function googleSignup() {
  await signInWithGoogle(postLoginUrl.value)
  if (!error.value) trackSignUp('oauth_google')
}

async function emailSignupComplete(email: string) {
  trackSignUp('email')
  await router.push({
    path: '/login',
    query: {
      signup: 'success',
      email,
      ...(redirect.value ? { redirect: redirect.value } : {}),
    },
  })
}

function whatsAppSignupComplete() {
  trackSignUp('whatsapp')
  window.location.href = postLoginUrl.value
}
</script>
