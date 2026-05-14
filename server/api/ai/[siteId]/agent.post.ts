// POST /api/ai/[siteId]/agent
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasCredits } from '~/server/utils/ai-credits'
import { getConfig } from '~/server/utils/site-config'
import { createChowBotStream, runChowBot, type ChowBotIncomingMessage, type ChowBotRunEvent } from '~/server/utils/chowbot-agent'
import {
  createMessage,
  getOrCreateConversation,
  getRecentAgentMessages,
  getSiteForMember,
} from '~/server/utils/chowbot-conversations'

interface AgentBody {
  conversationId?: string | null
  message?: string
  messages?: ChowBotIncomingMessage[]
  currentPage?: string
  locationId?: string | null
}

function latestUserText(body: AgentBody): string {
  if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')
  const content = typeof lastUser?.content === 'string' ? lastUser.content.trim() : ''
  return content
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await getSiteForMember(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: AgentBody
  try { body = await readBody(event) } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const userText = latestUserText(body)
  if (!userText) return jsonResponse({ error: 'message is required' }, { status: 400 })

  const creditOk = await hasCredits(db, site.organization_id)
  if (!creditOk) return jsonResponse({ error: 'No AI credits remaining.' }, { status: 402 })

  const conversation = await getOrCreateConversation(db, {
    conversationId: body.conversationId ?? null,
    organizationId: site.organization_id,
    siteId,
    userId: session.user.id,
    firstMessage: userText,
    activeChannel: 'dashboard',
    selectedLocationId: typeof body.locationId === 'string' ? body.locationId : null,
  })

  await createMessage(db, {
    conversationId: conversation.id,
    organizationId: site.organization_id,
    siteId,
    userId: session.user.id,
    role: 'user',
    channel: 'dashboard',
    content: userText,
  })

  const messages = await getRecentAgentMessages(db, conversation.id, siteId, session.user.id)
  const siteConfig = await getConfig(db, site.organization_id, siteId)
  const defaultCurrency = siteConfig.default_currency || 'THB'

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  let assistantText = ''
  let finalEvent: ChowBotRunEvent | null = null

  const readable = createChowBotStream(async (push) => {
    try {
      await runChowBot({
        db,
        env,
        orgId: site.organization_id,
        siteId,
        userId: session.user.id,
        siteName: site.brand_name ?? 'your site',
        defaultCurrency,
        messages,
        currentPage: body.currentPage ?? 'dashboard',
        locationId: typeof body.locationId === 'string' ? body.locationId : null,
        onEvent: async (ev) => {
          if (ev.type === 'text') assistantText = ev.content ?? ''
          if (ev.type === 'done') finalEvent = ev
          await push({ ...ev, conversationId: conversation.id } as ChowBotRunEvent & { conversationId: string })
        },
      })

      await createMessage(db, {
        conversationId: conversation.id,
        organizationId: site.organization_id,
        siteId,
        userId: session.user.id,
        role: 'assistant',
        channel: 'dashboard',
        content: assistantText,
        toolCalls: finalEvent?.toolCalls ?? [],
      })
    } catch (error) {
      await createMessage(db, {
        conversationId: conversation.id,
        organizationId: site.organization_id,
        siteId,
        userId: session.user.id,
        role: 'assistant',
        channel: 'dashboard',
        content: error instanceof Error ? error.message : 'Something went wrong.',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Something went wrong.',
      })
      throw error
    }
  })

  return sendStream(event, readable)
})
