import { authClient } from '~/lib/auth-client'
import { googleSignInOptions } from '~/shared/auth/oauth-login'

export function useAuthOperation() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function run<T>(operation: () => Promise<T>, fallback: string): Promise<T | null> {
    if (loading.value) return null
    loading.value = true
    error.value = null
    try {
      return await operation()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : fallback
      return null
    } finally {
      loading.value = false
    }
  }

  async function signInWithGoogle(callbackURL?: string) {
    return run(async () => {
      const result = await authClient.signIn.social(googleSignInOptions(callbackURL))
      if (result?.error) throw new Error(result.error.message || 'Google sign in failed.')
      return result
    }, 'Google sign in failed. Please try again.')
  }

  return { loading: readonly(loading), error, run, signInWithGoogle }
}
