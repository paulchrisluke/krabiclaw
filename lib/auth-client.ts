// Better Auth client for Nuxt/Vue
import { createAuthClient } from 'better-auth/vue'
import { adminClient, anonymousClient, organizationClient, phoneNumberClient } from 'better-auth/client/plugins'
import { organizationAccessControl, organizationRoles } from '~/utils/organization-access'
import { oauthProviderClient } from '@better-auth/oauth-provider/client'
import { stripeClient } from '@better-auth/stripe/client'

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    anonymousClient(),
    organizationClient({ ac: organizationAccessControl, roles: organizationRoles, teams: { enabled: true } }),
    phoneNumberClient(),
    oauthProviderClient(),
    stripeClient({ subscription: true }),
  ]
})

export const { signIn, signOut, useSession } = authClient
