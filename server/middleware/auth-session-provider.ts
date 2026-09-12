import { defineHandler } from 'nitro'
import { getAuthSession } from '~/server/utils/auth'
import { cloudflareEnv } from '~/server/utils/api-response'

/**
 * Hands the page render a way to read the session **in process**, on the
 * original Worker request.
 *
 * Better Auth's Nuxt client can take `useFetch` and ask its own
 * `/api/auth/get-session` over HTTP. On Cloudflare that becomes a nested
 * internal self-fetch, which does not inherit the Worker's bindings — the
 * runtime says so itself:
 *
 *   [cloudflareEnv] Missing bindings: DB, MEDIA_BUCKET, SITE_CACHE, AI for
 *   no-host/api/auth/get-session (cf-ray: no-cf-ray) … nested internal
 *   self-fetch … Fetch the data directly instead of self-fetching.
 *
 * createAuth then throws "Database unavailable", the session resolves to
 * nothing during SSR, and every surface that renders from it — the platform
 * header's Sign in / Start free, the pricing CTAs, accept-invitation — renders
 * without it. A composable cannot import server/utils/auth itself without
 * dragging it into the client bundle, so the provider is handed over here and
 * useAuthSession calls it.
 */
export default defineHandler((event) => {
  event.context.authSessionProvider = () => getAuthSession(event, cloudflareEnv(event))
})
