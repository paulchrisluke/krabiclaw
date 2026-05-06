
import { computed, ref, isRef } from 'vue'
import { authClient } from '~/utils/auth-client'

export function useAuth() {
  const session = authClient.useSession()

  const sessionData = isRef(session?.data)
    ? session.data
    : ref(null)

  const sessionLoading = isRef(session?.isPending)
    ? session.isPending
    : ref(false)

  const sessionError = isRef(session?.error)
    ? session.error
    : ref(null)

  const user = computed(() => sessionData.value?.user ?? null)
  const isAuthenticated = computed(() => !!user.value)

  return {
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
