<template>
  <div>
    <h1 class="text-4xl font-extrabold tracking-tight text-default">Create your account</h1>
    <p class="mt-2 mb-7 text-sm text-muted">Start building and managing your business online.</p>
    <div v-if="error" role="alert" class="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>
    <div class="space-y-3">
      <AuthGoogleAuthButton :loading="loading" @activate="googleSignup" />
      <div class="flex items-center gap-3 py-1">
        <div class="h-px flex-1 bg-default" /><span class="text-xs uppercase tracking-widest text-dimmed">or</span><div class="h-px flex-1 bg-default" />
      </div>
      <AuthEmailSignUpForm :callback-url="verificationCallback" @success="emailSignupComplete" />
    </div>
    <p class="mt-6 text-center text-sm text-muted">Already have an account? <NuxtLink :to="loginUrl" class="font-semibold text-primary">Sign in</NuxtLink></p>
  </div>
</template>

<script setup lang="ts">
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
</script>
