import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { ConversationNotFoundError, deleteConversation, getSiteForMember } from '~/server/utils/chowbot-conversations'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const conversationId = getRouterParam(event, 'conversationId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })
  if (!conversationId) return jsonResponse({ error: 'Conversation ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await getSiteForMember(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  try {
    await deleteConversation(db, conversationId, siteId, session.user.id)
    return jsonResponse({ success: true })
  } catch (err) {
    const code = (err && typeof err === 'object' && 'code' in err) ? (err as { code?: string }).code : undefined
    if (err instanceof ConversationNotFoundError || code === 'CONVERSATION_NOT_FOUND') {
      return jsonResponse({ error: 'Conversation not found' }, { status: 404 })
    }
    console.error('Failed to delete conversation:', err)
    return jsonResponse({ error: 'Failed to delete conversation' }, { status: 500 })
  }
})
