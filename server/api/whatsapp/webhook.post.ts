import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getConfig } from '~/server/utils/site-config'
import { fetchWhatsAppMedia, normalizePhone, sendWhatsAppText } from '~/server/utils/whatsapp'
import { extractMenuFromMediaAsset, saveInboundMediaAsset } from '~/server/utils/chowbot-media'
import { runChowBot } from '~/server/utils/chowbot-agent'
import {
  createMessage,
  getChannelState,
  getConversation,
  getOrCreateConversation,
  getRecentAgentMessages,
  getSiteForMember,
  listSitesForMember,
  metaMessageExists,
  upsertChannelState,
  type ChowBotConversation,
} from '~/server/utils/chowbot-conversations'

interface WhatsAppMessage {
  id: string
  from: string
  timestamp?: string
  type: 'text' | 'image' | 'document' | string
  text?: { body?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
}

interface WhatsAppPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[]
        statuses?: Array<{ id?: string; status?: string }>
      }
    }>
  }>
}

interface UserRow {
  id: string
  phoneNumber: string
  phoneNumberVerified: number
}

function inboundMessages(payload: WhatsAppPayload): WhatsAppMessage[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .flatMap((change) => change.value?.messages ?? [])
    .filter((message) => Boolean(message.id && message.from))
}

function messageText(message: WhatsAppMessage): string {
  if (message.type === 'text') return message.text?.body?.trim() ?? ''
  if (message.type === 'image') return message.image?.caption?.trim() ?? ''
  if (message.type === 'document') return message.document?.caption?.trim() ?? ''
  return ''
}

function intentFromText(text: string): 'import_menu' | 'save_media' | 'cancel' | 'agent' | null {
  if (/\b(cancel|never mind|nevermind|stop)\b/i.test(text)) return 'cancel'
  if (/\b(import|extract|read)\b/i.test(text) && /\b(menu|items?|dishes)\b/i.test(text)) return 'import_menu'
  if (/\b(save|library|media|photo)\b/i.test(text)) return 'save_media'
  if (/\b(post|caption|use it|use this|image task)\b/i.test(text)) return 'agent'
  return null
}

function siteListReply(sites: Array<{ id: string; brand_name: string | null }>): string {
  return [
    'Which site should ChowBot use?',
    ...sites.map((site, index) => `${index + 1}. ${site.brand_name ?? site.id}`),
    'Reply with the number.',
  ].join('\n')
}

async function reply(
  db: D1Database | null,
  env: ApiRecord,
  toPhone: string,
  text: string,
  opts?: {
    conversation?: ChowBotConversation
    userId?: string
    channel?: 'whatsapp'
    toolCalls?: Array<{ name: string; input: ApiValue; result: ApiValue }>
    status?: 'sent' | 'failed'
    error?: string | null
  }
) {
  const result = await sendWhatsAppText(env, toPhone, text)
  if (db && opts?.conversation) {
    await createMessage(db, {
      conversationId: opts.conversation.id,
      organizationId: opts.conversation.organization_id,
      siteId: opts.conversation.site_id,
      userId: opts.userId ?? opts.conversation.user_id,
      role: 'assistant',
      channel: 'whatsapp',
      content: text,
      metaMessageId: result.messageId ?? null,
      toolCalls: opts.toolCalls ?? null,
      status: result.success ? (opts.status ?? 'sent') : 'failed',
      error: result.success ? (opts.error ?? null) : (result.error ?? 'WhatsApp send failed'),
    })
  }
}

async function resolveUser(db: D1Database, from: string): Promise<UserRow | null> {
  const normalized = normalizePhone(from)
  return await db.prepare(`
    SELECT id, phoneNumber, phoneNumberVerified
    FROM user
    WHERE phoneNumber = ? AND phoneNumberVerified = 1
    LIMIT 1
  `).bind(normalized).first<UserRow>()
}

async function handleMessage(db: D1Database, env: ApiRecord, message: WhatsAppMessage): Promise<void> {
  if (await metaMessageExists(db, message.id)) return

  const toPhone = normalizePhone(message.from)
  const user = await resolveUser(db, message.from)
  if (!user) {
    await reply(null, env, toPhone, 'This WhatsApp number is not linked to a verified KrabiClaw account. Sign in once with WhatsApp OTP, then message ChowBot again.')
    return
  }

  const sites = await listSitesForMember(db, user.id)
  if (!sites.length) {
    await reply(null, env, toPhone, 'No KrabiClaw sites are available for this account.')
    return
  }

  const existingState = await getChannelState(db, user.id, 'whatsapp')
  let selectedSiteId = existingState?.selected_site_id ?? null
  let activeConversationId = existingState?.active_conversation_id ?? null
  const text = messageText(message)
  let selectedSiteNow = false

  if (!selectedSiteId && sites.length > 1) {
    const selectedIndex = /^\d+$/.test(text) ? Number(text) - 1 : -1
    const selected = sites[selectedIndex]
    if (!selected) {
      await upsertChannelState(db, {
        userId: user.id,
        channel: 'whatsapp',
        selectedSiteId: null,
        activeConversationId: null,
        pendingMedia: null,
        pendingConfirmation: null,
        lastInboundId: message.id,
      })
      await reply(null, env, toPhone, siteListReply(sites))
      return
    }
    selectedSiteId = selected.id
    selectedSiteNow = true
  }

  if (!selectedSiteId && sites.length === 1) {
    selectedSiteId = sites[0]!.id
    selectedSiteNow = true
  }
  if (!selectedSiteId) {
    await reply(null, env, toPhone, 'Choose a site before using ChowBot.')
    return
  }

  const site = await getSiteForMember(db, selectedSiteId, user.id)
  if (!site) {
    await upsertChannelState(db, {
      userId: user.id,
      channel: 'whatsapp',
      selectedSiteId: null,
      activeConversationId: null,
      pendingMedia: null,
      pendingConfirmation: null,
      lastInboundId: message.id,
    })
    await reply(null, env, toPhone, 'That site is no longer available. Reply again to choose a site.')
    return
  }

  if (selectedSiteNow && message.type === 'text' && /^\d+$/.test(text)) {
    await upsertChannelState(db, {
      userId: user.id,
      channel: 'whatsapp',
      selectedSiteId: site.id,
      activeConversationId: null,
      pendingMedia: null,
      pendingConfirmation: null,
      lastInboundId: message.id,
    })
    await reply(null, env, toPhone, `ChowBot is now connected to ${site.brand_name ?? site.id}. What should we work on?`)
    return
  }

  const firstText = text || `WhatsApp ${message.type} message`
  let conversation = activeConversationId
    ? await getConversation(db, activeConversationId, site.id, user.id)
    : null
  if (!conversation) {
    conversation = await getOrCreateConversation(db, {
      organizationId: site.organization_id,
      siteId: site.id,
      userId: user.id,
      firstMessage: firstText,
      activeChannel: 'whatsapp',
    })
    activeConversationId = conversation.id
  }

  const state = await getChannelState(db, user.id, 'whatsapp')
  const pendingMedia = state?.pending_media ? JSON.parse(state.pending_media) as { assetId?: string; siteId?: string } : null
  const intent = pendingMedia ? intentFromText(text) : null

  if (pendingMedia && intent) {
    if (intent === 'cancel') {
      await upsertChannelState(db, { userId: user.id, channel: 'whatsapp', selectedSiteId: site.id, activeConversationId, pendingMedia: null, pendingConfirmation: null, lastInboundId: message.id })
      await createMessage(db, { conversationId: conversation.id, organizationId: site.organization_id, siteId: site.id, userId: user.id, role: 'user', channel: 'whatsapp', content: text, metaMessageId: message.id })
      await reply(db, env, toPhone, 'Canceled. What should we work on next?', { conversation, userId: user.id })
      return
    }

    if (intent === 'save_media') {
      await upsertChannelState(db, { userId: user.id, channel: 'whatsapp', selectedSiteId: site.id, activeConversationId, pendingMedia: null, pendingConfirmation: null, lastInboundId: message.id })
      await createMessage(db, { conversationId: conversation.id, organizationId: site.organization_id, siteId: site.id, userId: user.id, role: 'user', channel: 'whatsapp', content: text, metaMessageId: message.id })
      await reply(db, env, toPhone, `Saved to the media library as asset ${pendingMedia.assetId}.`, { conversation, userId: user.id })
      return
    }

    if (intent === 'import_menu' && pendingMedia.assetId) {
      await createMessage(db, { conversationId: conversation.id, organizationId: site.organization_id, siteId: site.id, userId: user.id, role: 'user', channel: 'whatsapp', content: text, metaMessageId: message.id })
      const extracted = await extractMenuFromMediaAsset(db, env, { organizationId: site.organization_id, siteId: site.id, userId: user.id, assetId: pendingMedia.assetId })
      await upsertChannelState(db, { userId: user.id, channel: 'whatsapp', selectedSiteId: site.id, activeConversationId, pendingMedia: null, pendingConfirmation: null, lastInboundId: message.id })
      const resultText = extracted.count
        ? `Imported ${extracted.count} menu item${extracted.count === 1 ? '' : 's'} into a draft menu. Review and publish it from the dashboard.`
        : `I could not find menu items in that file. ${extracted.warning ?? ''}`.trim()
      await reply(db, env, toPhone, resultText, { conversation, userId: user.id })
      return
    }
  }

  if (message.type === 'image' || message.type === 'document') {
    const mediaId = message.type === 'image' ? message.image?.id : message.document?.id
    if (!mediaId) {
      await reply(db, env, toPhone, 'WhatsApp did not include a media ID for that file.', { conversation, userId: user.id, status: 'failed', error: 'Missing media ID' })
      return
    }
    const media = await fetchWhatsAppMedia(env, mediaId)
    const asset = await saveInboundMediaAsset(db, env, {
      organizationId: site.organization_id,
      siteId: site.id,
      userId: user.id,
      bytes: media.bytes,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      filename: message.type === 'document' ? message.document?.filename : undefined,
    })
    await createMessage(db, {
      conversationId: conversation.id,
      organizationId: site.organization_id,
      siteId: site.id,
      userId: user.id,
      role: 'user',
      channel: 'whatsapp',
      content: text || `Sent ${message.type}`,
      media: { assetId: asset.id, mimeType: asset.mime_type, publicUrl: asset.public_url },
      metaMessageId: message.id,
    })
    await upsertChannelState(db, {
      userId: user.id,
      channel: 'whatsapp',
      selectedSiteId: site.id,
      activeConversationId,
      pendingMedia: { assetId: asset.id, siteId: site.id },
      pendingConfirmation: null,
      lastInboundId: message.id,
    })
    await reply(db, env, toPhone, 'I saved that file. Reply with one of: import menu, save media, use for post, or cancel.', { conversation, userId: user.id })
    return
  }

  await createMessage(db, {
    conversationId: conversation.id,
    organizationId: site.organization_id,
    siteId: site.id,
    userId: user.id,
    role: 'user',
    channel: 'whatsapp',
    content: text,
    metaMessageId: message.id,
  })

  await upsertChannelState(db, {
    userId: user.id,
    channel: 'whatsapp',
    selectedSiteId: site.id,
    activeConversationId,
    pendingMedia: pendingMedia ?? null,
    pendingConfirmation: null,
    lastInboundId: message.id,
  })

  const siteConfig = await getConfig(db, site.organization_id, site.id)
  const messages = await getRecentAgentMessages(db, conversation.id, site.id, user.id)
  let assistantText = ''
  const result = await runChowBot({
    db,
    env,
    orgId: site.organization_id,
    siteId: site.id,
    userId: user.id,
    siteName: site.brand_name ?? 'your site',
    defaultCurrency: siteConfig.default_currency || 'THB',
    messages,
    currentPage: 'whatsapp',
    onEvent: (ev) => {
      if (ev.type === 'text') assistantText = ev.content ?? ''
    },
  })

  await reply(db, env, toPhone, assistantText || result.responseText, {
    conversation,
    userId: user.id,
    toolCalls: result.toolCalls,
  })
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const payload = await readBody(event).catch(() => ({})) as WhatsAppPayload
  const messages = inboundMessages(payload)

  for (const message of messages) {
    await handleMessage(db, env, message)
  }

  return jsonResponse({ success: true })
})
