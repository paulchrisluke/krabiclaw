import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { fetchWhatsAppMedia, sendWhatsAppText } from '~/server/utils/whatsapp'
import { parsePhoneOrThrow } from '~/utils/phone'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { saveInboundMediaAsset } from '~/server/utils/chowbot-media'
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
import { queryFirst } from '~/server/db'
import { ensureGuestThread, getGuestThreadSource } from '~/server/utils/guest-threads'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import { findSubmissionByPhone, insertInboundSubmissionReply } from '~/server/utils/submission-messages'

interface WhatsAppMessage {
  id: string
  message_id?: string
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

function platformLoginUrl(env: ApiRecord): string {
  const raw = String(env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'https://krabiclaw.com').trim()
  const origin = /^https?:\/\//i.test(raw) ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
  return `${origin}/login`
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
    }, opts.userId ?? opts.conversation.user_id)

    if (result.success) {
      // Soft-fail: the reply already went out, so an exhausted balance never
      // blocks the conversation — it just skips the charge.
      await chargeFlatCredits(db, opts.conversation.organization_id, {
        siteId: opts.conversation.site_id ?? undefined,
        action: 'whatsapp_free_text',
      }).catch(() => {})
    }
  }
}

async function resolveUser(db: D1Database, from: string): Promise<UserRow | null> {
  const normalized = parsePhoneOrThrow(from, { defaultCountry: 'TH' })
  return await queryFirst<UserRow>(db, `
    SELECT id, phoneNumber, phoneNumberVerified
    FROM user
    WHERE phoneNumber = ? AND phoneNumberVerified = 1
    LIMIT 1
  `, [normalized])
}

function parsePendingMedia(raw: string | null | undefined): { assetId: string; siteId: string } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { assetId?: unknown; siteId?: unknown }
    if (typeof parsed.assetId !== 'string' || typeof parsed.siteId !== 'string') {
      return null
    }
    return { assetId: parsed.assetId, siteId: parsed.siteId }
  } catch {
    return null
  }
}

async function runChowBotAndReply(
  db: D1Database,
  env: ApiRecord,
  opts: {
    toPhone: string
    conversation: ChowBotConversation
    organizationId: string
    siteId: string
    userId: string
    userRole?: string
    siteName: string | null
    pendingMedia: { assetId: string; siteId: string } | null
  }
) {
  const site = await queryFirst<{ default_currency: string | null }>(db,
    `SELECT default_currency FROM sites WHERE id = ? AND organization_id = ? LIMIT 1`,
    [opts.siteId, opts.organizationId]
  )
  const messages = await getRecentAgentMessages(db, opts.conversation.id, opts.siteId, opts.userId)
  let assistantText = ''
  const result = await runChowBot({
    db,
    env,
    orgId: opts.organizationId,
    siteId: opts.siteId,
    userId: opts.userId,
    userRole: opts.userRole,
    siteName: opts.siteName ?? 'your site',
    defaultCurrency: site?.default_currency || 'THB',
    messages,
    currentPage: 'whatsapp',
    channel: 'whatsapp',
    pendingMedia: opts.pendingMedia ?? undefined,
    onEvent: (ev) => {
      if (ev.type === 'text') assistantText = ev.content ?? ''
    },
  })

  await reply(db, env, opts.toPhone, assistantText || result.responseText, {
    conversation: opts.conversation,
    userId: opts.userId,
    toolCalls: result.toolCalls,
  })
}

async function handleMessage(db: D1Database, env: ApiRecord, message: WhatsAppMessage): Promise<void> {
  if (await metaMessageExists(db, message.id)) return

  const toPhone = parsePhoneOrThrow(message.from, { defaultCountry: 'TH' })
  const user = await resolveUser(db, message.from)
  if (!user) {
    // Not a verified owner/staff account — check whether this is a customer replying to an
    // open reservation/experience-booking thread rather than trying to talk to ChowBot.
    const match = await findSubmissionByPhone(db, toPhone)
    if (match) {
      const text = messageText(message)
      if (text) {
        try {
          await insertInboundSubmissionReply(env, db, {
            submissionType: match.submissionType,
            submissionId: match.submissionId,
            organizationId: match.organizationId,
            siteId: match.siteId,
            channel: 'whatsapp',
            body: text,
            metaMessageId: message.id,
            from: toPhone,
          })
          const thread = await ensureGuestThread(db, match.submissionType, match.submissionId)
          const source = await getGuestThreadSource(db, match.submissionType, match.submissionId)
          if (source) {
            await notifyGuestThreadReply(env, db, {
              organizationId: match.organizationId,
              siteId: match.siteId,
              locationId: source.location_id,
              threadId: thread.id,
              submissionType: match.submissionType,
              submissionId: match.submissionId,
              guestName: source.guest_name,
              guestEmail: source.guest_email,
              guestPhone: source.guest_phone,
              inboundChannel: 'whatsapp',
              messagePreview: text,
            })
          }
        } catch (err) {
          console.error('[whatsapp] Failed to insert guest reply for submission:', err)
        }
      }
      return
    }
    await reply(null, env, toPhone, `To continue, open KrabiClaw: ${platformLoginUrl(env)}`)
    return
  }

  const sites = await listSitesForMember(db, user.id)
  if (!sites.length) {
    await reply(null, env, toPhone, 'No KrabiClaw sites are available for this account.')
    return
  }

  const existingState = await getChannelState(db, user.id, 'whatsapp')
  
  // Idempotency check: skip if this message was already processed
  const messageId = message.id || message.message_id
  if (existingState?.last_inbound_id === messageId) {
    console.log('[whatsapp] Skipping duplicate message:', messageId)
    return
  }
  
  let selectedSiteId = existingState?.selected_site_id ?? null
  let activeConversationId = existingState?.active_conversation_id ?? null
  const text = messageText(message)
  let selectedSiteFromList = false

  const pendingMedia = parsePendingMedia(existingState?.pending_media)

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
    selectedSiteFromList = true
  }

  if (!selectedSiteId && sites.length === 1) {
    selectedSiteId = sites[0]!.id
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

  if (selectedSiteFromList && message.type === 'text' && /^\d+$/.test(text)) {
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

  if (message.type === 'image' || message.type === 'document') {
    const mediaId = message.type === 'image' ? message.image?.id : message.document?.id
    if (!mediaId) {
      await reply(db, env, toPhone, 'WhatsApp did not include a media ID for that file.', { conversation, userId: user.id, status: 'failed', error: 'Missing media ID' })
      return
    }

    try {
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
        content: text || `Uploaded ${message.type}`,
        media: { asset_id: asset.id, mime_type: asset.mime_type },
        metaMessageId: message.id,
      }, user.id)

      await upsertChannelState(db, {
        userId: user.id,
        channel: 'whatsapp',
        selectedSiteId: site.id,
        activeConversationId,
        pendingMedia: { assetId: asset.id, siteId: site.id },
        pendingConfirmation: { intent: 'pending_media' },
        lastInboundId: message.id,
      })

      await runChowBotAndReply(db, env, {
        toPhone,
        conversation,
        organizationId: site.organization_id,
        siteId: site.id,
        userId: user.id,
        userRole: site.role,
        siteName: site.brand_name,
        pendingMedia: { assetId: asset.id, siteId: site.id },
      })
      return
    } catch (err) {
      await reply(db, env, toPhone, 'Failed to process the media file. Please try again.', { conversation, userId: user.id, status: 'failed', error: String(err) })
      return
    }
  }

  try {
    await createMessage(db, {
      conversationId: conversation.id,
      organizationId: site.organization_id,
      siteId: site.id,
      userId: user.id,
      role: 'user',
      channel: 'whatsapp',
      content: text || firstText,
      metaMessageId: message.id,
    }, user.id)

    await runChowBotAndReply(db, env, {
      toPhone,
      conversation,
      userId: user.id,
      organizationId: site.organization_id,
      siteId: site.id,
      userRole: site.role,
      siteName: site.brand_name,
      pendingMedia,
    })
  } catch (err) {
    await reply(db, env, toPhone, 'Sorry, something went wrong. Please try again.', {
      conversation,
      userId: user.id,
      status: 'failed',
      error: String(err),
    })
  }
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const rawBody = await readRawBody(event) ?? ''
  const appSecret = typeof env.WHATSAPP_APP_SECRET === 'string' ? env.WHATSAPP_APP_SECRET : ''
  if (appSecret) {
    const signature = getHeader(event, 'x-hub-signature-256') ?? ''
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const incomingHex = signature.startsWith('sha256=') ? signature.slice(7) : ''
    const pairs = incomingHex.match(/.{2}/g)
    const parsedPairs = pairs && pairs.length === 32 ? pairs.map((b) => parseInt(b, 16)) : null
    const incomingBytes = parsedPairs && parsedPairs.every((n) => !Number.isNaN(n))
      ? new Uint8Array(parsedPairs)
      : new Uint8Array(0)
    const isValid = incomingBytes.length === 32 && await crypto.subtle.verify(
      { name: 'HMAC', hash: 'SHA-256' },
      key,
      incomingBytes,
      new TextEncoder().encode(rawBody),
    )
    if (!isValid) {
      return jsonResponse({ error: 'Invalid signature' }, { status: 403 })
    }
  }

  let payload: WhatsAppPayload = {}
  try { payload = rawBody ? JSON.parse(rawBody) : {} } catch { payload = {} }
  const messages = inboundMessages(payload)

  for (const message of messages) {
    await handleMessage(db, env, message)
  }

  return jsonResponse({ success: true })
})
