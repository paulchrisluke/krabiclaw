import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getConversation, getSiteForMember, listMessages } from '~/server/utils/chowbot-conversations'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const conversationId = getRouterParam(event, 'conversationId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  if (!conversationId) return jsonResponse({ error: 'Conversation ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await getSiteForMember(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const conversation = await getConversation(db, conversationId, siteId, session.user.id)
  if (!conversation) return jsonResponse({ error: 'Conversation not found' }, { status: 404 })

  const messages = await listMessages(db, conversationId, siteId, session.user.id)
  return jsonResponse({ success: true, conversation, messages })
})
