// Better Auth client for Nuxt/Vue
import { createAuthClient } from 'better-auth/vue'
import { organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [organizationClient()]
})

export const { signIn, signOut, useSession } = authClient
