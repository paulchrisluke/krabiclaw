export type JsonSerializable = string | number | boolean | null | { [key: string]: JsonSerializable } | JsonSerializable[]

import { execute, queryFirst, type DbClient } from '~/server/db'

export type ChowBotChannel = 'dashboard' | 'whatsapp'

function nowIso() {
  return new Date().toISOString()
}

function jsonOrNull(value: JsonSerializable | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value)
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
    pending_confirmation: string | null
    last_inbound_id: string | null
    updated_at: string
  }>(db, `
    SELECT user_id, channel, selected_site_id, active_conversation_id, pending_message_id, pending_confirmation, last_inbound_id, updated_at
      FROM chowbot_channel_state
     WHERE user_id = ? AND channel = ? LIMIT 1
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
