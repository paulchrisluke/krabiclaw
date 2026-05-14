import type { ChowBotToolCall, JsonSerializable } from '~/server/utils/chowbot-agent'

export type ChowBotChannel = 'dashboard' | 'whatsapp'
export type ChowBotRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChowBotSiteAccess {
  id: string
  organization_id: string
  brand_name: string | null
  role: string
}

export interface ChowBotConversation {
  id: string
  organization_id: string
  site_id: string
  user_id: string
  title: string
  active_channel: ChowBotChannel
  status: 'active' | 'archived' | 'deleted'
  selected_location_id: string | null
  created_at: string
  updated_at: string
}

export interface ChowBotMessage {
  id: string
  conversation_id: string
  organization_id: string
  site_id: string
  user_id: string | null
  role: ChowBotRole
  channel: ChowBotChannel
  content: string | null
  media: string | null
  meta_message_id: string | null
  tool_calls: string | null
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'read'
  error: string | null
  created_at: string
}

export interface CreateMessageInput {
  conversationId: string
  organizationId: string
  siteId: string
  userId?: string | null
  role: ChowBotRole
  channel: ChowBotChannel
  content?: string | null
  media?: JsonSerializable | null
  metaMessageId?: string | null
  toolCalls?: ChowBotToolCall[] | null
  status?: 'pending' | 'processing' | 'sent' | 'failed' | 'read'
  error?: string | null
}

function nowIso() {
  return new Date().toISOString()
}

function titleFromText(text: string): string {
  const title = text.replace(/\s+/g, ' ').trim().slice(0, 45)
  return title || 'New ChowBot chat'
}

export async function getSiteForMember(
  db: D1Database,
  siteId: string,
  userId: string,
  roles: string[] = ['owner', 'admin', 'editor']
): Promise<ChowBotSiteAccess | null> {
  const placeholders = roles.map(() => '?').join(', ')
  return await db.prepare(`
    SELECT s.id, s.organization_id, s.brand_name, m.role
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE s.id = ? AND m.userId = ? AND m.role IN (${placeholders})
    LIMIT 1
  `).bind(siteId, userId, ...roles).first<ChowBotSiteAccess>()
}

export async function listSitesForMember(
  db: D1Database,
  userId: string,
  roles: string[] = ['owner', 'admin', 'editor']
): Promise<ChowBotSiteAccess[]> {
  const placeholders = roles.map(() => '?').join(', ')
  const { results } = await db.prepare(`
    SELECT s.id, s.organization_id, s.brand_name, m.role
    FROM sites s
    JOIN member m ON s.organization_id = m.organizationId
    WHERE m.userId = ? AND m.role IN (${placeholders}) AND s.status = 'active'
    ORDER BY s.updated_at DESC
  `).bind(userId, ...roles).all<ChowBotSiteAccess>()
  return results ?? []
}

export async function listConversations(
  db: D1Database,
  siteId: string,
  userId: string
): Promise<ChowBotConversation[]> {
  const { results } = await db.prepare(`
    SELECT * FROM chowbot_conversations
    WHERE site_id = ? AND user_id = ? AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 20
  `).bind(siteId, userId).all<ChowBotConversation>()
  return results ?? []
}

export async function getConversation(
  db: D1Database,
  conversationId: string,
  siteId: string,
  userId: string
): Promise<ChowBotConversation | null> {
  return await db.prepare(`
    SELECT * FROM chowbot_conversations
    WHERE id = ? AND site_id = ? AND user_id = ? AND status = 'active'
    LIMIT 1
  `).bind(conversationId, siteId, userId).first<ChowBotConversation>()
}

export async function createConversation(
  db: D1Database,
  opts: {
    organizationId: string
    siteId: string
    userId: string
    title?: string
    activeChannel: ChowBotChannel
    selectedLocationId?: string | null
  }
): Promise<ChowBotConversation> {
  const id = crypto.randomUUID()
  const now = nowIso()
  await db.prepare(`
    INSERT INTO chowbot_conversations
      (id, organization_id, site_id, user_id, title, active_channel, selected_location_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    opts.organizationId,
    opts.siteId,
    opts.userId,
    opts.title?.trim() || 'New ChowBot chat',
    opts.activeChannel,
    opts.selectedLocationId ?? null,
    now,
    now
  ).run()

  const created = await getConversation(db, id, opts.siteId, opts.userId)
  if (!created) throw new Error('Failed to create ChowBot conversation')
  return created
}

export async function getOrCreateConversation(
  db: D1Database,
  opts: {
    conversationId?: string | null
    organizationId: string
    siteId: string
    userId: string
    firstMessage: string
    activeChannel: ChowBotChannel
    selectedLocationId?: string | null
  }
): Promise<ChowBotConversation> {
  if (opts.conversationId) {
    const existing = await getConversation(db, opts.conversationId, opts.siteId, opts.userId)
    if (!existing) throw new Error('ChowBot conversation not found')
    return existing
  }

  return await createConversation(db, {
    organizationId: opts.organizationId,
    siteId: opts.siteId,
    userId: opts.userId,
    title: titleFromText(opts.firstMessage),
    activeChannel: opts.activeChannel,
    selectedLocationId: opts.selectedLocationId ?? null,
  })
}

export async function touchConversation(
  db: D1Database,
  conversationId: string,
  channel: ChowBotChannel
): Promise<void> {
  await db.prepare(`
    UPDATE chowbot_conversations
    SET active_channel = ?, updated_at = ?
    WHERE id = ?
  `).bind(channel, nowIso(), conversationId).run()
}

export async function deleteConversation(
  db: D1Database,
  conversationId: string,
  siteId: string,
  userId: string
): Promise<void> {
  await db.prepare(`
    UPDATE chowbot_conversations
    SET status = 'deleted', updated_at = ?
    WHERE id = ? AND site_id = ? AND user_id = ?
  `).bind(nowIso(), conversationId, siteId, userId).run()
}

export async function createMessage(db: D1Database, input: CreateMessageInput): Promise<ChowBotMessage> {
  const id = crypto.randomUUID()
  const now = nowIso()
  await db.prepare(`
    INSERT INTO chowbot_messages
      (id, conversation_id, organization_id, site_id, user_id, role, channel, content, media, meta_message_id, tool_calls, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.conversationId,
    input.organizationId,
    input.siteId,
    input.userId ?? null,
    input.role,
    input.channel,
    input.content ?? null,
    input.media ? JSON.stringify(input.media) : null,
    input.metaMessageId ?? null,
    input.toolCalls ? JSON.stringify(input.toolCalls) : null,
    input.status ?? 'sent',
    input.error ?? null,
    now
  ).run()
  await touchConversation(db, input.conversationId, input.channel)

  const message = await db.prepare(`
    SELECT * FROM chowbot_messages WHERE id = ? LIMIT 1
  `).bind(id).first<ChowBotMessage>()
  if (!message) throw new Error('Failed to create ChowBot message')
  return message
}

export async function listMessages(
  db: D1Database,
  conversationId: string,
  siteId: string,
  userId: string,
  limit = 100
): Promise<ChowBotMessage[]> {
  const { results } = await db.prepare(`
    SELECT m.*
    FROM chowbot_messages m
    JOIN chowbot_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = ? AND m.site_id = ? AND c.user_id = ? AND c.status = 'active'
    ORDER BY m.created_at ASC
    LIMIT ?
  `).bind(conversationId, siteId, userId, limit).all<ChowBotMessage>()
  return results ?? []
}

export async function getRecentAgentMessages(
  db: D1Database,
  conversationId: string,
  siteId: string,
  userId: string,
  limit = 8
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const messages = await listMessages(db, conversationId, siteId, userId, 100)
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content && m.status !== 'failed')
    .slice(-limit)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' }))
}

export async function getChannelState(
  db: D1Database,
  userId: string,
  channel: ChowBotChannel
): Promise<{
  user_id: string
  channel: ChowBotChannel
  selected_site_id: string | null
  active_conversation_id: string | null
  pending_media: string | null
  pending_confirmation: string | null
  last_inbound_id: string | null
  updated_at: string
} | null> {
  return await db.prepare(`
    SELECT * FROM chowbot_channel_state WHERE user_id = ? AND channel = ? LIMIT 1
  `).bind(userId, channel).first()
}

export async function upsertChannelState(
  db: D1Database,
  opts: {
    userId: string
    channel: ChowBotChannel
    selectedSiteId?: string | null
    activeConversationId?: string | null
    pendingMedia?: JsonSerializable | null
    pendingConfirmation?: JsonSerializable | null
    lastInboundId?: string | null
  }
): Promise<void> {
  await db.prepare(`
    INSERT INTO chowbot_channel_state
      (user_id, channel, selected_site_id, active_conversation_id, pending_media, pending_confirmation, last_inbound_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, channel) DO UPDATE SET
      selected_site_id = excluded.selected_site_id,
      active_conversation_id = excluded.active_conversation_id,
      pending_media = excluded.pending_media,
      pending_confirmation = excluded.pending_confirmation,
      last_inbound_id = excluded.last_inbound_id,
      updated_at = excluded.updated_at
  `).bind(
    opts.userId,
    opts.channel,
    opts.selectedSiteId ?? null,
    opts.activeConversationId ?? null,
    opts.pendingMedia ? JSON.stringify(opts.pendingMedia) : null,
    opts.pendingConfirmation ? JSON.stringify(opts.pendingConfirmation) : null,
    opts.lastInboundId ?? null,
    nowIso()
  ).run()
}

export async function metaMessageExists(db: D1Database, metaMessageId: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT id FROM chowbot_messages WHERE meta_message_id = ? LIMIT 1
  `).bind(metaMessageId).first()
  return Boolean(row)
}
