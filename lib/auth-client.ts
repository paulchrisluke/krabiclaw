// Better Auth client for Nuxt/Vue
import { createAuthClient } from 'better-auth/vue'
import { adminClient, organizationClient, phoneNumberClient } from 'better-auth/client/plugins'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    organizationClient(),
    phoneNumberClient(),
    oauthProviderClient(),
  ]
})

export const { signIn, signOut, useSession } = authClient
