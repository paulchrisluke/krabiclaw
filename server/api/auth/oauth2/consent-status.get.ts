import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const clientId = getQuery(event).client_id
  if (!clientId || typeof clientId !== 'string') {
    return { hasConsented: false }
  }
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return { hasConsented: false }
  }
  const consent = await env.DB
    .prepare('SELECT id FROM oauthConsent WHERE clientId = ? AND userId = ? LIMIT 1')
    .bind(clientId, session.user.id)
    .first<{ id: string }>()
  return { hasConsented: !!consent }
})
