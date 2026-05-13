// Better Auth client for Nuxt/Vue
import { createAuthClient } from 'better-auth/vue'
import { organizationClient, phoneNumberClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    phoneNumberClient(),
  ]
})

export const { signIn, signOut, useSession } = authClient
