import { authClient } from '~/lib/auth-client'

type Session = typeof authClient.$Infer.Session

/** The payload key the session is fetched under, so it can be refetched by name. */
const AUTH_SESSION_KEY = 'auth-session'

/**
 * The session, on the server and the client, from one place.
 *
 * On the server it is read in process through the provider
 * server/middleware/auth-session-provider.ts puts on the request — Better
 * Auth's own server API, on the original Worker request, where the bindings
 * are. Its Vue client can do this over HTTP instead
 * (`authClient.useSession(useFetch)`), and that is the documented Nuxt path,
 * but on Cloudflare the call is a nested self-fetch that inherits no bindings:
 * `createAuth` throws "Database unavailable" and every surface that renders
 * from the session loses it during SSR. See that middleware for the runtime's
 * own diagnosis.
 *
 * On the client it is Better Auth's session store, hydrated from the payload
 * the server render produced, so the store every other Better Auth call reads
 * is the one this returns.
 */
export async function useAuthSession() {
  const nuxtApp = useNuxtApp()

  if (import.meta.client) {
    const { data } = useNuxtData<{ session: Session | null }>(AUTH_SESSION_KEY)
    if (nuxtApp.isHydrating && data.value) authClient.hydrateSession(data.value.session)
    const session = authClient.useSession()
    return {
      sessionData: computed(() => session.value.data),
      user: computed(() => session.value.data?.user ?? null),
      isAuthenticated: computed(() => Boolean(session.value.data?.user)),
      sessionLoading: computed(() => session.value.isPending),
      sessionError: computed(() => session.value.error),
      refresh: () => refreshNuxtData(AUTH_SESSION_KEY),
    }
  }

  const event = useRequestEvent()
  const result = await useAsyncData(AUTH_SESSION_KEY, async () => {
    const provider = event?.context.authSessionProvider as (() => Promise<Session | null>) | undefined
    if (!provider) throw createError({ statusCode: 500, statusMessage: 'Auth session provider unavailable' })
    return { session: await provider() }
  })
  const sessionData = computed(() => result.data.value?.session ?? null)
  const user = computed(() => sessionData.value?.user ?? null)
  return {
    sessionData,
    user,
    isAuthenticated: computed(() => Boolean(user.value)),
    sessionLoading: computed(() => result.status.value === 'pending'),
    sessionError: computed(() => result.error.value ?? null),
    refresh: () => refreshNuxtData(AUTH_SESSION_KEY),
  }
}
