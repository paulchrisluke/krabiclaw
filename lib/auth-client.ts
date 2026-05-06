// Better Auth client for Nuxt/Vue
import { createAuthClient } from 'better-auth/vue'
import { organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:8788',
  plugins: [organizationClient()]
})

export const { signIn, signOut, useSession } = authClient
