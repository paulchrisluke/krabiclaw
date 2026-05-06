<template>
  <div class="min-h-screen bg-stone-50">
    <div class="max-w-md mx-auto pt-16 pb-12 px-4">
      <!-- KrabiClaw Branding -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-stone-900 mb-2">
          KrabiClaw
        </h1>
        <p class="text-stone-600">
          Sign in to your restaurant website dashboard
        </p>
      </div>

      <!-- Login Card -->
      <div class="bg-white rounded-xl shadow-sm border border-stone-200 p-8">
        <h2 class="text-xl font-semibold text-stone-900 mb-6">
          Sign In
        </h2>

        <!-- Google Sign In -->
        <div class="space-y-4">
          <button
            @click="handleGoogleSignIn"
            :disabled="loading"
            class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span class="text-stone-700 font-medium">
              Continue with Google
            </span>
          </button>

          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-stone-300"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-stone-500">or</span>
            </div>
          </div>

          <!-- Email Login (placeholder) -->
          <div class="text-center py-4 text-stone-500 text-sm">
            Email login coming soon
          </div>
        </div>

        <!-- Sign Up Link -->
        <div class="mt-6 text-center text-sm text-stone-600">
          Don't have an account?
          <NuxtLink to="/signup" class="text-stone-900 hover:underline font-medium">
            Start free
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

definePageMeta({
  layout: 'platform'
})


const router = useRouter()
const loading = ref(false)

// Handle Google Sign In
const handleGoogleSignIn = async () => {
  loading.value = true
  try {
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/dashboard'
    })
  } catch (error) {
    console.error('Google sign in error:', error)
  } finally {
    loading.value = false
  }
}
</script>
