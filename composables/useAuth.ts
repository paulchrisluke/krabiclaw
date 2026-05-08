
import { computed } from 'vue'
import { authClient } from '~/lib/auth-client'

export function useAuth() {
  const session = authClient.useSession()

  const sessionData = computed(() => session.value?.data ?? null)
  const sessionLoading = computed(() => session.value?.isPending ?? true)
  const sessionError = computed(() => session.value?.error ?? null)

  const user = computed(() => sessionData.value?.user ?? null)
  const isAuthenticated = computed(() => !!user.value)

  return {
    session,
    data: sessionData,
    sessionData,
    sessionLoading,
    sessionError,
    user,
    isAuthenticated,
    signOut: authClient.signOut,
    signIn: authClient.signIn,
  }
}

export const signOutUser = async () => {
  await authClient.signOut()
  await navigateTo('/login')
}

export const signInWithGoogle = async (callbackURL?: string) => {
  await authClient.signIn.social({
    provider: 'google',
    callbackURL: callbackURL || '/dashboard'
  })
}
