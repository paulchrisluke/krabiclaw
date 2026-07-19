import { authClient } from '~/lib/auth-client'

export async function useAuthSession() {
  const result = await authClient.useSession(useFetch)
  const sessionData = computed(() => result.data.value ?? null)
  const user = computed(() => sessionData.value?.user ?? null)
  return {
    sessionData,
    user,
    isAuthenticated: computed(() => Boolean(user.value)),
    sessionLoading: computed(() => Boolean(result.isPending)),
    sessionError: computed(() => result.error.value ?? null),
  }
}
