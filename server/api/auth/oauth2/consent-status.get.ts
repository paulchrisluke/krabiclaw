import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { queryFirst } from '~/server/db'

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
  const consent = await queryFirst<{ id: string }>(
    env.DB,
    'SELECT id FROM oauthConsent WHERE clientId = ? AND userId = ? LIMIT 1',
    [clientId, session.user.id],
  )
  return { hasConsented: !!consent }
})
