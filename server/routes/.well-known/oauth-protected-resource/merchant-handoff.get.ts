import { defineHandler } from 'nitro'
import { setResponseHeaders } from 'nitro/h3'
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client'
import { cloudflareEnv } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const baseUrl = (env.BETTER_AUTH_URL ?? 'https://krabiclaw.com').replace(/\/$/, '')

  setResponseHeaders(event, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  })

  const { getProtectedResourceMetadata } = oauthProviderResourceClient(createAuth(env)).getActions()
  return await getProtectedResourceMetadata({
    resource: `${baseUrl}/api/integrations/merchant-handoff`,
    bearer_methods_supported: ['header'],
    scopes_supported: ['offline_access', 'merchant_handoff'],
  })
})
