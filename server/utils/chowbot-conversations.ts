import type { ChowBotToolCall, JsonSerializable } from '~/server/utils/chowbot-agent'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { buildMediaPlacementInsertQuery } from '~/server/utils/media-asset-manager'
import { assertSiteWideAccess, isOrganizationWideRole, resolveOrganizationMembership } from '~/server/utils/member-access'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { getOrgAdapter } from 'better-auth/plugins'

export type ChowBotChannel = 'dashboard' | 'whatsapp'
export type ChowBotRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChowBotSiteAccess {
  id: string
  organization_id: string
  brand_name: string | null
  default_currency: string
  role: string
  member_id: string
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
  mediaAssetId?: string | null
  metaMessageId?: string | null
  toolCalls?: ChowBotToolCall[] | null
  status?: 'pending' | 'processing' | 'sent' | 'failed' | 'read'
  error?: string | null
}

export class ConversationNotFoundError extends Error {
  code = 'CONVERSATION_NOT_FOUND' as const

  constructor(message = 'ChowBot conversation not found') {
    super(message)
    this.name = 'ConversationNotFoundError'
  }
}

function nowIso() {
  return new Date().toISOString()
}

function jsonOrNull(value: JsonSerializable | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value)
}

function titleFromText(text: string): string {
  const title = text.replace(/\s+/g, ' ').trim().slice(0, 45)
  return title || 'New ChowBot chat'
}

function isExpectedSiteWideAccessDenial(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return false
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return statusCode === 403 || statusCode === 404
}

// ChowBot operates conversationally across a whole site (no location-scoped
// permission model at this layer), so — like MCP's requireMcpSite — an editor
// needs the site's resource team membership. A location-only editor is
// rejected rather than silently getting whole-site chat access.
export async function getSiteForMember(
  db: DbClient,
  env: CloudflareEnv,
  siteId: string,
  userId: string,
): Promise<ChowBotSiteAccess | null> {
  const site = await queryFirst<Omit<ChowBotSiteAccess, 'role' | 'member_id'>>(db, `
    SELECT id, organization_id, brand_name, default_currency
    FROM sites WHERE id = ? AND status = 'active' LIMIT 1
  `, [siteId])
  if (!site) return null
  const membership = await resolveOrganizationMembership(env, { organizationId: site.organization_id, userId })
  if (!membership) return null
  const result: ChowBotSiteAccess = {
    ...site,
    role: membership.role,
    member_id: membership.memberId,
  }
  if (!isOrganizationWideRole(result.role)) {
    try {
      await assertSiteWideAccess(db, { env, memberId: result.member_id, role: result.role, organizationId: result.organization_id, siteId })
    } catch (error) {
      if (!isExpectedSiteWideAccessDenial(error)) throw error
      return null
    }
  }
  return result
}

export async function listSitesForMember(
  db: DbClient,
  env: CloudflareEnv,
  userId: string,
): Promise<ChowBotSiteAccess[]> {
  const auth = createAuth(env)
  const context = await auth.$context
  const adapter = getOrgAdapter(context as Parameters<typeof getOrgAdapter>[0], {})
  const organizations = await adapter.listOrganizations(userId)
  const memberships = await Promise.all(organizations.map(organization => (
    adapter.findMemberByOrgId({ userId, organizationId: organization.id })
  )))
  const byOrganization = new Map(memberships.filter(Boolean).map(member => [member!.organizationId, member!]))
  if (byOrganization.size === 0) return []
  const organizationIds = [...byOrganization.keys()]
  const sites = await queryAll<Omit<ChowBotSiteAccess, 'role' | 'member_id'>>(db, `
    SELECT id, organization_id, brand_name, default_currency
    FROM sites
    WHERE organization_id IN (SELECT value FROM json_each(?)) AND status = 'active'
    ORDER BY updated_at DESC
  `, [d1JsonStringSet(organizationIds)])
  const accessible: ChowBotSiteAccess[] = []
  for (const site of sites) {
    const member = byOrganization.get(site.organization_id)
    if (!member) continue
    const candidate = { ...site, role: String(member.role), member_id: member.id }
    if (isOrganizationWideRole(candidate.role)) {
      accessible.push(candidate)
      continue
    }
    try {
      await assertSiteWideAccess(db, {
        env,
        memberId: candidate.member_id,
        role: candidate.role,
        organizationId: candidate.organization_id,
        siteId: candidate.id,
      })
      accessible.push(candidate)
    } catch (error) {
      if (!isExpectedSiteWideAccessDenial(error)) throw error
    }
  }
  return accessible
}

export async function listConversations(
  db: DbClient,
  siteId: string,
  userId: string
): Promise<ChowBotConversation[]> {
  const results = await queryAll<ChowBotConversation>(db, `
    SELECT * FROM chowbot_conversations
    WHERE site_id = ? AND user_id = ? AND status = 'active'
    ORDER BY updated_at DESC
    LIMIT 20
  `, [siteId, userId])
  return results ?? []
}

export async function getConversation(
  db: DbClient,
  conversationId: string,
  siteId: string,
  userId: string
): Promise<ChowBotConversation | null> {
  const result = await queryFirst<ChowBotConversation>(db, `
    SELECT * FROM chowbot_conversations
    WHERE id = ? AND site_id = ? AND user_id = ? AND status = 'active'
    LIMIT 1
  `, [conversationId, siteId, userId])
  return result ?? null
}

export async function createConversation(
  db: DbClient,
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
  await execute(db, `
    INSERT INTO chowbot_conversations
      (id, organization_id, site_id, user_id, title, active_channel, status, selected_location_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    opts.organizationId,
    opts.siteId,
    opts.userId,
    opts.title?.trim() || 'New ChowBot chat',
    opts.activeChannel,
    'active',
    opts.selectedLocationId ?? null,
    now,
    now,
  ])

  const created = await getConversation(db, id, opts.siteId, opts.userId)
  if (!created) throw new Error('Failed to create conversation')
  return created
}

export async function getOrCreateConversation(
  db: DbClient,
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
  db: DbClient,
  conversationId: string,
  siteId: string,
  userId: string,
  channel: ChowBotChannel
): Promise<void> {
  await execute(db, `
    UPDATE chowbot_conversations
    SET active_channel = ?, updated_at = ?
    WHERE id = ? AND site_id = ? AND user_id = ?
  `, [channel, nowIso(), conversationId, siteId, userId])
}

export async function deleteConversation(
  db: DbClient,
  conversationId: string,
  siteId: string,
  userId: string
): Promise<void> {
  const result = await execute(db, `
    UPDATE chowbot_conversations
    SET status = 'deleted', updated_at = ?
    WHERE id = ? AND site_id = ? AND user_id = ?
  `, [nowIso(), conversationId, siteId, userId])

  if (!Number(result.meta.changes ?? 0)) {
    throw new ConversationNotFoundError()
  }
}

export async function createMessage(db: DbClient, input: CreateMessageInput, actorUserId: string): Promise<ChowBotMessage> {
  // Verify conversation exists and user has access
  const conversation = await getConversation(db, input.conversationId, input.siteId, actorUserId)
  if (!conversation) {
    throw new Error('ChowBot conversation not found or access denied')
  }

  const id = crypto.randomUUID()
  const now = nowIso()

  await executeBatch(db, [{ query: `
    INSERT INTO chowbot_messages
      (id, conversation_id, organization_id, site_id, user_id, role, channel, content, meta_message_id, tool_calls, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, params: [
    id,
    input.conversationId,
    conversation.organization_id,
    conversation.site_id,
    input.userId ?? null,
    input.role,
    input.channel,
    input.content ?? null,
    input.metaMessageId ?? null,
    input.toolCalls ? JSON.stringify(input.toolCalls) : null,
    input.status ?? 'sent',
    input.error ?? null,
    now,
  ] }, ...(input.mediaAssetId ? [buildMediaPlacementInsertQuery({
    organizationId: conversation.organization_id,
    siteId: conversation.site_id,
    ownerType: 'chowbot_message',
    ownerId: id,
    slot: 'attachment',
    assetId: input.mediaAssetId,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })] : []), {
    query: 'UPDATE chowbot_conversations SET updated_at = ?, active_channel = ? WHERE id = ?',
    params: [now, input.channel, input.conversationId],
  }])

  const created = await queryFirst<ChowBotMessage>(db, `
    SELECT * FROM chowbot_messages WHERE id = ?
  `, [id])

  if (!created) throw new Error('Failed to create message')
  return created
}

export async function listMessages(
  db: DbClient,
  conversationId: string,
  siteId: string,
  userId: string,
  limit = 100,
  offset = 0
): Promise<ChowBotMessage[]> {
  const results = await queryAll<ChowBotMessage>(db, `
    SELECT m.*
    FROM chowbot_messages m
    JOIN chowbot_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = ? AND m.site_id = ? AND c.user_id = ? AND c.status = 'active'
    ORDER BY m.created_at ASC
    LIMIT ? OFFSET ?
  `, [conversationId, siteId, userId, limit, offset])
  return results ?? []
}

export async function getRecentAgentMessages(
  db: DbClient,
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
  db: DbClient,
  userId: string,
  channel: ChowBotChannel
): Promise<{
  user_id: string
  channel: ChowBotChannel
  selected_site_id: string | null
  active_conversation_id: string | null
  pending_message_id: string | null
  pending_asset_id: string | null
  pending_asset_site_id: string | null
  pending_confirmation: string | null
  last_inbound_id: string | null
  updated_at: string
} | null> {
  const result = await queryFirst<{
    user_id: string
    channel: ChowBotChannel
    selected_site_id: string | null
    active_conversation_id: string | null
    pending_message_id: string | null
    pending_asset_id: string | null
    pending_asset_site_id: string | null
    pending_confirmation: string | null
    last_inbound_id: string | null
    updated_at: string
  }>(db, `
    SELECT state.*, mp.asset_id AS pending_asset_id, mp.site_id AS pending_asset_site_id
      FROM chowbot_channel_state state
      LEFT JOIN media_placements mp ON mp.owner_type = 'chowbot_message'
        AND mp.owner_id = state.pending_message_id AND mp.slot = 'attachment'
        AND mp.sort_order = 0 AND mp.status = 'active'
     WHERE state.user_id = ? AND state.channel = ? LIMIT 1
  `, [userId, channel])
  return result ?? null
}

export async function upsertChannelState(
  db: DbClient,
  opts: {
    userId: string
    channel: ChowBotChannel
    selectedSiteId?: string | null
    activeConversationId?: string | null
    pendingMessageId?: string | null
    pendingConfirmation?: JsonSerializable | null
    lastInboundId?: string | null
  }
): Promise<void> {
  const updateFields: string[] = []
  if ('selectedSiteId' in opts) updateFields.push('selected_site_id = excluded.selected_site_id')
  if ('activeConversationId' in opts) updateFields.push('active_conversation_id = excluded.active_conversation_id')
  if ('pendingMessageId' in opts) updateFields.push('pending_message_id = excluded.pending_message_id')
  if ('pendingConfirmation' in opts) updateFields.push('pending_confirmation = excluded.pending_confirmation')
  if ('lastInboundId' in opts) updateFields.push('last_inbound_id = excluded.last_inbound_id')
  updateFields.push('updated_at = excluded.updated_at')

  await execute(db, `
    INSERT INTO chowbot_channel_state
      (user_id, channel, selected_site_id, active_conversation_id, pending_message_id, pending_confirmation, last_inbound_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, channel) DO UPDATE SET
      ${updateFields.join(',\n      ')}
  `, [
    opts.userId,
    opts.channel,
    opts.selectedSiteId ?? null,
    opts.activeConversationId ?? null,
    opts.pendingMessageId ?? null,
    jsonOrNull(opts.pendingConfirmation),
    opts.lastInboundId ?? null,
    nowIso(),
  ])
}

export async function metaMessageExists(db: DbClient, metaMessageId: string): Promise<boolean> {
  const row = await queryFirst(db, `
    SELECT id FROM chowbot_messages WHERE meta_message_id = ? LIMIT 1
  `, [metaMessageId])
  return Boolean(row)
}
