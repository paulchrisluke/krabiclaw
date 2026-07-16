import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { compareWhatsAppDeliveryStatus, fetchWhatsAppMedia, sendWhatsAppText } from '~/server/utils/whatsapp'
import { parsePhoneOrThrow } from '~/utils/phone'
import { chargeFlatCredits } from '~/server/utils/ai-credits'
import { saveInboundMediaAsset } from '~/server/utils/chowbot-media'
import { runChowBot, type JsonSerializable } from '~/server/utils/chowbot-agent'
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
import { execute, queryAll, queryFirst } from '~/server/db'
import { ensureGuestThread, getGuestThreadBySubmission, getGuestThreadDetail, getGuestThreadSource, postGuestThreadReply } from '~/server/utils/guest-threads'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import { findSubmissionByPhone, insertInboundSubmissionReply } from '~/server/utils/submission-messages'
import { isAuthorizedWhatsAppRecipient } from '~/server/utils/member-access'
import {
  ASK_CHOWBOT_OR_QUOTE_MESSAGE,
  REPLY_SENT_CONFIRMATION,
  buildCollectReplyPrompt,
  buildConfirmSendPrompt,
  buildDisambiguationPrompt,
  buildReplyFailedMessage,
  decideWhatsAppReplyRouting,
  isChowBotDirective,
  maskEmailForDisplay,
  stripChowBotPrefix,
  type DisambiguationCandidate,
  type PendingWhatsAppReplyState,
} from '~/server/utils/whatsapp-reply-routing'

interface WhatsAppMessage {
  id: string
  message_id?: string
  from: string
  timestamp?: string
  type: 'text' | 'image' | 'document' | string
  text?: { body?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  // Present when the manager replied by quoting (long-pressing) a prior outbound
  // message — `id` is that message's WhatsApp message id, correlated back to
  // notifications.provider_message_id (see issue #293 Section C.1). Like `statuses`
  // before Workstream 4, this was parsed nowhere until now.
  context?: { id?: string; from?: string }
}

interface WhatsAppStatusError {
  code?: number
  title?: string
  message?: string
  error_data?: { details?: string }
}

interface WhatsAppStatus {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
  errors?: WhatsAppStatusError[]
}

interface WhatsAppPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[]
        statuses?: WhatsAppStatus[]
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

function inboundStatuses(payload: WhatsAppPayload): WhatsAppStatus[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .flatMap((change) => change.value?.statuses ?? [])
    .filter((status) => Boolean(status.id && status.status))
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

function parsePendingReplyState(raw: string | null | undefined): PendingWhatsAppReplyState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown }
    // The same pending_confirmation column also carries an unrelated
    // `{ intent: 'pending_media' }` marker from the media-upload flow — only claim
    // objects that actually match one of our reply-routing state shapes.
    if (parsed.kind === 'confirm_send' || parsed.kind === 'disambiguate' || parsed.kind === 'collect_reply') {
      return parsed as PendingWhatsAppReplyState
    }
    return null
  } catch {
    return null
  }
}

function submissionTypeLabel(type: string): string {
  if (type === 'reservation') return 'Reservation'
  if (type === 'experience_booking') return 'Booking'
  return 'Message'
}

interface QuotedNotificationMatch {
  threadId: string
  siteId: string
  organizationId: string
  guestEmail: string
}

// Resolves a manager's quoted-reply context.id back to the operational notification it
// was sent from, then to the guest thread it correlates with — issue #293 Section C.1.
// Returns null (never throws) for "no match yet" so the caller can treat it as
// unmatched and fall through to the remaining routing tiers rather than erroring.
async function resolveQuotedNotification(
  db: D1Database,
  providerMessageId: string,
  phone: string,
): Promise<QuotedNotificationMatch | null> {
  const notification = await queryFirst<{
    organization_id: string
    site_id: string | null
    location_id: string | null
    related_submission_type: 'contact' | 'reservation' | 'experience_booking' | 'invitation' | null
    related_submission_id: string | null
  }>(db, `
    SELECT organization_id, site_id, location_id, related_submission_type, related_submission_id
    FROM notifications
    WHERE provider_message_id = ? AND related_submission_type IS NOT NULL AND related_submission_id IS NOT NULL
    LIMIT 1
  `, [providerMessageId])
  if (!notification || !notification.site_id || !notification.related_submission_type || !notification.related_submission_id) return null
  // 'invitation' is a valid related_submission_type (Workstream 2) but has no guest thread.
  if (notification.related_submission_type === 'invitation') return null

  const authorized = await isAuthorizedWhatsAppRecipient(db, {
    phone,
    organizationId: notification.organization_id,
    siteId: notification.site_id,
    locationId: notification.location_id,
    requireSiteWide: false,
  })
  if (!authorized) return null

  const thread = await getGuestThreadBySubmission(db, notification.related_submission_type, notification.related_submission_id)
  if (!thread || !thread.guest_email) return null

  return { threadId: thread.id, siteId: thread.site_id, organizationId: thread.organization_id, guestEmail: thread.guest_email }
}

// Tier 3 candidate list: recent (24h) guest-related operational notifications scoped to
// sites/locations the manager is authorized for (org-wide roles see everything in their
// org; location_manager/editor need a matching member_access_scope row). Grouped by
// guest thread so a guest with multiple notification events in the window (e.g. created
// + a reply) only appears once, most recent first.
async function listRecentGuestNotificationCandidates(db: D1Database, userId: string): Promise<DisambiguationCandidate[]> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const rows = await queryAll<{
    threadId: string
    organizationId: string
    siteId: string
    locationId: string | null
    guestName: string
    submissionType: string
  }>(db, `
    SELECT gt.id AS threadId, gt.organization_id AS organizationId, gt.site_id AS siteId, gt.location_id AS locationId,
           gt.guest_name AS guestName, gt.submission_type AS submissionType, MAX(n.created_at) AS createdAt
    FROM notifications n
    JOIN member m ON m.organizationId = n.organization_id AND m.userId = ?
    JOIN guest_threads gt ON gt.submission_type = n.related_submission_type AND gt.submission_id = n.related_submission_id
    LEFT JOIN member_access_scope mas ON mas.member_id = m.id AND mas.organization_id = n.organization_id
      AND mas.site_id = n.site_id AND (mas.location_id IS NULL OR mas.location_id = n.location_id)
    WHERE n.channel = 'whatsapp'
      AND n.related_submission_type IS NOT NULL AND n.related_submission_id IS NOT NULL
      AND n.created_at > ?
      AND (m.role IN ('owner', 'admin') OR (m.role IN ('editor', 'location_manager') AND mas.id IS NOT NULL))
    GROUP BY gt.id
    ORDER BY createdAt DESC
    LIMIT 5
  `, [userId, sinceIso])

  return (rows ?? []).map((r) => ({
    threadId: r.threadId,
    siteId: r.siteId,
    organizationId: r.organizationId,
    locationId: r.locationId,
    label: `${submissionTypeLabel(r.submissionType)} from ${r.guestName}`,
  }))
}

// Issue #293 Section C's four-tier routing contract, applied only to messages from a
// resolveUser-verified platform user (managers). Handles all I/O (lookups,
// authorization, sends, channel-state persistence) around the pure decision function in
// server/utils/whatsapp-reply-routing.ts. Returns `{ handled: false }` only when the
// message should continue into the existing (unchanged) ChowBot dispatch flow — either
// because it was explicitly ChowBot-directed, or because the manager hasn't finished the
// pre-existing multi-site selection step yet (which also uses bare numeric replies, and
// must keep first claim on them so it isn't shadowed by tier 3's disambiguation picker).
async function routeManagerWhatsAppMessage(
  db: D1Database,
  env: ApiRecord,
  opts: {
    message: WhatsAppMessage
    toPhone: string
    userId: string
    existingState: Awaited<ReturnType<typeof getChannelState>>
    messageId: string
    sites: Array<{ id: string }>
  },
): Promise<{ handled: true } | { handled: false; effectiveText: string }> {
  const rawText = messageText(opts.message)
  const pendingState = parsePendingReplyState(opts.existingState?.pending_confirmation)
  const contextId = opts.message.context?.id ?? null
  const hasQuotedContext = Boolean(contextId)
  const needsSiteSelection = !opts.existingState?.selected_site_id && opts.sites.length > 1

  const clearPending = () => upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: null, lastInboundId: opts.messageId })

  async function resolveFreshDispatch(): Promise<
    | { bypassToChowBotSiteSelection: true }
    | {
        bypassToChowBotSiteSelection: false
        quotedMatch: 'authorized_thread_found' | 'unmatched' | null
        quotedResolved: QuotedNotificationMatch | null
        isChowBotDirected: boolean
        recentNotificationCount: number
        recentCandidates: DisambiguationCandidate[]
      }
  > {
    const isChowBotDirected = isChowBotDirective(rawText)
    let quotedResolved: QuotedNotificationMatch | null = null
    let quotedMatch: 'authorized_thread_found' | 'unmatched' | null = null
    if (hasQuotedContext) {
      quotedResolved = await resolveQuotedNotification(db, contextId!, opts.toPhone)
      quotedMatch = quotedResolved ? 'authorized_thread_found' : 'unmatched'
    }

    if (!quotedResolved && !isChowBotDirected && needsSiteSelection) {
      // Neither a correlated quoted reply nor an explicit ChowBot directive — this bare
      // text is ambiguous between "pick a site" (pre-existing flow) and tier 3's
      // guest-notification disambiguation. Site selection is a one-time bootstrap step
      // that must not be shadowed by a same-shaped numeric picker.
      return { bypassToChowBotSiteSelection: true }
    }

    let recentCandidates: DisambiguationCandidate[] = []
    if (!quotedResolved && !isChowBotDirected) {
      recentCandidates = await listRecentGuestNotificationCandidates(db, opts.userId)
    }

    return {
      bypassToChowBotSiteSelection: false,
      quotedMatch,
      quotedResolved,
      isChowBotDirected,
      recentNotificationCount: recentCandidates.length,
      recentCandidates,
    }
  }

  if (!pendingState) {
    const fresh = await resolveFreshDispatch()
    if (fresh.bypassToChowBotSiteSelection) return { handled: false, effectiveText: rawText }

    const decision = decideWhatsAppReplyRouting({
      hasQuotedContext,
      quotedMatch: fresh.quotedMatch,
      isChowBotDirected: fresh.isChowBotDirected,
      pendingState: null,
      recentNotificationCount: fresh.recentNotificationCount,
      text: rawText,
    })

    switch (decision.action) {
      case 'start_confirm_send': {
        const match = fresh.quotedResolved!
        const guestEmailMasked = maskEmailForDisplay(match.guestEmail)
        const newState: PendingWhatsAppReplyState = {
          kind: 'confirm_send',
          threadId: match.threadId,
          siteId: match.siteId,
          organizationId: match.organizationId,
          replyBody: rawText,
          guestEmailMasked,
        }
        await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: newState, lastInboundId: opts.messageId })
        await sendWhatsAppText(env, opts.toPhone, buildConfirmSendPrompt(guestEmailMasked))
        return { handled: true }
      }
      case 'start_disambiguation': {
        const newState: PendingWhatsAppReplyState = { kind: 'disambiguate', candidates: fresh.recentCandidates }
        await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: newState as unknown as JsonSerializable, lastInboundId: opts.messageId })
        await sendWhatsAppText(env, opts.toPhone, buildDisambiguationPrompt(fresh.recentCandidates))
        return { handled: true }
      }
      case 'ask_chowbot_or_quote': {
        await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: null, lastInboundId: opts.messageId })
        await sendWhatsAppText(env, opts.toPhone, ASK_CHOWBOT_OR_QUOTE_MESSAGE)
        return { handled: true }
      }
      case 'chowbot':
        await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: null, lastInboundId: opts.messageId })
        return { handled: false, effectiveText: stripChowBotPrefix(rawText) }
      default:
        // Unreachable when pendingState is null (the pending-state resume actions are
        // only ever returned when pendingState is non-null) — kept for exhaustiveness.
        return { handled: false, effectiveText: rawText }
    }
  }

  // A pending confirm_send / disambiguate / collect_reply state exists — resume it.
  if (pendingState.kind === 'confirm_send') {
    const decision = decideWhatsAppReplyRouting({ hasQuotedContext: false, quotedMatch: null, isChowBotDirected: false, pendingState, recentNotificationCount: 0, text: rawText })
    if (decision.action === 'confirm_send_execute') {
      const result = await postGuestThreadReply(db, env, {
        threadId: pendingState.threadId,
        siteId: pendingState.siteId,
        senderUserId: opts.userId,
        body: pendingState.replyBody,
      })
      await clearPending()
      if (result.ok) {
        await sendWhatsAppText(env, opts.toPhone, REPLY_SENT_CONFIRMATION)
      } else {
        const errorText = result.reason === 'send_failed' ? result.error : result.reason
        await sendWhatsAppText(env, opts.toPhone, buildReplyFailedMessage(errorText))
      }
      return { handled: true }
    }
    // Non-affirmative reply: drop the pending confirmation without sending, then treat
    // this message as an independent fresh dispatch (issue #293: "clear the pending
    // state... let normal routing resume for that message").
    await clearPending()
  } else if (pendingState.kind === 'disambiguate') {
    const decision = decideWhatsAppReplyRouting({ hasQuotedContext: false, quotedMatch: null, isChowBotDirected: false, pendingState, recentNotificationCount: 0, text: rawText })
    if (decision.action === 'disambiguation_pick') {
      const chosen = pendingState.candidates[decision.index - 1]!
      const detail = await getGuestThreadDetail(db, chosen.threadId, chosen.siteId)
      if (!detail || !detail.source.guest_email) {
        await clearPending()
        await sendWhatsAppText(env, opts.toPhone, 'That guest has no email on file, so a reply cannot be sent.')
        return { handled: true }
      }
      const guestEmailMasked = maskEmailForDisplay(detail.source.guest_email)
      const newState: PendingWhatsAppReplyState = { kind: 'collect_reply', threadId: chosen.threadId, siteId: chosen.siteId, organizationId: chosen.organizationId, guestEmailMasked }
      await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: newState, lastInboundId: opts.messageId })
      await sendWhatsAppText(env, opts.toPhone, buildCollectReplyPrompt(guestEmailMasked))
      return { handled: true }
    }
    await clearPending()
  } else {
    // collect_reply: any non-empty text becomes the reply body, moving to confirm_send.
    const newState: PendingWhatsAppReplyState = {
      kind: 'confirm_send',
      threadId: pendingState.threadId,
      siteId: pendingState.siteId,
      organizationId: pendingState.organizationId,
      replyBody: rawText,
      guestEmailMasked: pendingState.guestEmailMasked,
    }
    await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: newState, lastInboundId: opts.messageId })
    await sendWhatsAppText(env, opts.toPhone, buildConfirmSendPrompt(pendingState.guestEmailMasked))
    return { handled: true }
  }

  // Cancelled confirm_send/disambiguate above — redispatch this same message fresh.
  const fresh = await resolveFreshDispatch()
  if (fresh.bypassToChowBotSiteSelection) return { handled: false, effectiveText: rawText }

  const decision = decideWhatsAppReplyRouting({
    hasQuotedContext,
    quotedMatch: fresh.quotedMatch,
    isChowBotDirected: fresh.isChowBotDirected,
    pendingState: null,
    recentNotificationCount: fresh.recentNotificationCount,
    text: rawText,
  })

  switch (decision.action) {
    case 'start_confirm_send': {
      const match = fresh.quotedResolved!
      const guestEmailMasked = maskEmailForDisplay(match.guestEmail)
      const newState: PendingWhatsAppReplyState = {
        kind: 'confirm_send',
        threadId: match.threadId,
        siteId: match.siteId,
        organizationId: match.organizationId,
        replyBody: rawText,
        guestEmailMasked,
      }
      await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: newState, lastInboundId: opts.messageId })
      await sendWhatsAppText(env, opts.toPhone, buildConfirmSendPrompt(guestEmailMasked))
      return { handled: true }
    }
    case 'start_disambiguation': {
      const newState: PendingWhatsAppReplyState = { kind: 'disambiguate', candidates: fresh.recentCandidates }
      await upsertChannelState(db, { userId: opts.userId, channel: 'whatsapp', pendingConfirmation: newState as unknown as JsonSerializable, lastInboundId: opts.messageId })
      await sendWhatsAppText(env, opts.toPhone, buildDisambiguationPrompt(fresh.recentCandidates))
      return { handled: true }
    }
    case 'chowbot':
      return { handled: false, effectiveText: stripChowBotPrefix(rawText) }
    default:
      await sendWhatsAppText(env, opts.toPhone, ASK_CHOWBOT_OR_QUOTE_MESSAGE)
      return { handled: true }
  }
}

async function handleManagerChowBotMessage(
  db: D1Database,
  env: ApiRecord,
  opts: {
    user: UserRow
    message: WhatsAppMessage
    toPhone: string
    existingState: Awaited<ReturnType<typeof getChannelState>>
    sites: Array<{ id: string; organization_id: string; brand_name: string | null; default_currency: string | null; role: string }>
    text: string
  },
): Promise<void> {
  const { user, message, existingState, sites, toPhone } = opts
  if (!sites.length) {
    await reply(null, env, toPhone, 'No KrabiClaw sites are available for this account.')
    return
  }

  let selectedSiteId = existingState?.selected_site_id ?? null
  let activeConversationId = existingState?.active_conversation_id ?? null
  const text = opts.text
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

  // Idempotency check: skip if this message was already processed. Checked before the
  // new manager-routing tiers (not just the ChowBot tail) since those tiers also send
  // replies and mutate channel state — a webhook retry must not run them twice either.
  const messageId = message.id || message.message_id
  const existingState = await getChannelState(db, user.id, 'whatsapp')
  if (existingState?.last_inbound_id === messageId) {
    console.log('[whatsapp] Skipping duplicate message:', messageId)
    return
  }

  const sites = await listSitesForMember(db, user.id)

  // Issue #293 Section C: quoted-notification replies, ChowBot directives, and
  // guest-notification disambiguation take priority over the default "always ChowBot"
  // behavior. Only messages this returns `{ handled: false }` for continue into the
  // pre-existing ChowBot dispatch flow below, unchanged.
  const routed = await routeManagerWhatsAppMessage(db, env, {
    message,
    toPhone,
    userId: user.id,
    existingState,
    messageId: messageId ?? message.id,
    sites,
  })
  if (routed.handled) return

  await handleManagerChowBotMessage(db, env, {
    user,
    message,
    toPhone,
    existingState,
    sites,
    text: routed.effectiveText,
  })
}

function formatStatusError(errors: WhatsAppStatusError[] | undefined): string | null {
  if (!errors?.length) return null
  try {
    return JSON.stringify(errors)
  } catch {
    return null
  }
}

// Meta status webhooks (value.statuses[]) reference outbound messages by
// provider_message_id, not by anything tied to a manager/session — a failed
// or missing lookup here must never touch member/scope/OTP state (see
// server/utils/whatsapp-access.ts, untouched by this function).
async function handleStatus(db: D1Database, status: WhatsAppStatus): Promise<void> {
  const providerMessageId = status.id
  const incomingStatus = status.status
  if (!providerMessageId || !incomingStatus) return

  const notification = await queryFirst<{ id: string; whatsapp_delivery_status: string | null }>(db, `
    SELECT id, whatsapp_delivery_status
    FROM notifications
    WHERE provider_message_id = ?
    LIMIT 1
  `, [providerMessageId])
  // No matching notification — either a message this app didn't send, or one
  // that's since been pruned. Expected and silent, not an error.
  if (!notification) return

  const shouldAdvanceStatus = compareWhatsAppDeliveryStatus(notification.whatsapp_delivery_status, incomingStatus)
  const errorText = formatStatusError(status.errors)

  if (shouldAdvanceStatus) {
    await execute(db, `
      UPDATE notifications
      SET whatsapp_delivery_status = ?, whatsapp_delivery_error = ?
      WHERE id = ?
    `, [incomingStatus, errorText, notification.id])
    return
  }

  // A `failed` event arrived after a later success stage was already
  // recorded (or a same/earlier-stage replay) — never regress
  // whatsapp_delivery_status, but still persist the raw provider error so a
  // failure is never silently lost.
  if (errorText) {
    await execute(db, `
      UPDATE notifications
      SET whatsapp_delivery_error = ?
      WHERE id = ?
    `, [errorText, notification.id])
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
  const statuses = inboundStatuses(payload)

  for (const message of messages) {
    await handleMessage(db, env, message)
  }
  for (const status of statuses) {
    await handleStatus(db, status)
  }

  return jsonResponse({ success: true })
})
