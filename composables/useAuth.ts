import { authClient, useSession } from '~/utils/auth-client'

export const useAuth = () => {
  return useSession()
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
