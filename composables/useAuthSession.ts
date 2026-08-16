import { authClient } from '~/lib/auth-client'
import type { getAuthSession } from '~/server/utils/auth'

type AuthSession = Awaited<ReturnType<typeof getAuthSession>>

export async function useAuthSession() {
  const sessionState = useState<AuthSession | null>('auth-session', () => null)

  if (import.meta.server) {
    const event = useRequestEvent()
    if (!event) throw new Error('Request event is unavailable while resolving the auth session')

    const [{ cloudflareEnv }, { getAuthSession }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/auth'),
    ])
    sessionState.value = await getAuthSession(event, cloudflareEnv(event))
  } else {
    const clientSession = authClient.useSession()
    watchEffect(() => {
      if (clientSession.value !== undefined) {
        sessionState.value = clientSession.value.data ?? null
      }
    })
  }

  const sessionData = computed(() => sessionState.value)
  const user = computed(() => sessionData.value?.user ?? null)
  return {
    sessionData,
    user,
    isAuthenticated: computed(() => Boolean(user.value)),
    sessionLoading: computed(() => false),
    sessionError: computed(() => null),
  }
}
