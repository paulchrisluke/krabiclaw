// Pure decision logic for issue #293 Section C's "direct-WhatsApp-reply routing
// contract" — deliberately free of D1/network I/O so the four-tier priority order
// (and the pending-state resume paths layered on top of it) can be unit tested without
// a live webhook or database. server/api/whatsapp/webhook.post.ts is the only caller;
// it resolves the I/O inputs below (notification/thread lookups, authorization,
// channel state) and then executes whatever action this function returns.
//
// Priority order (see issue #293 "Direct-message routing contract"), evaluated only for
// messages from a resolveUser-verified platform user (managers) — guests are handled by
// the pre-existing findSubmissionByPhone path elsewhere in the webhook:
//   1. Quoted operational notification (message.context.id) that resolves to an
//      authorized, correlated guest thread.
//   2. Explicit "ChowBot: " prefix (or bare "ChowBot").
//   3. Unquoted text while recent (24h) guest notifications exist for the manager's
//      authorized sites — numbered disambiguation.
//   4. Unquoted text with no relevant guest context — ask if they meant ChowBot.
// A pending confirm-send or disambiguation/collect-reply state (stored via the existing
// chowbot_channel_state.pending_confirmation column) takes priority over all of the
// above until it resolves or is explicitly abandoned.

export interface DisambiguationCandidate {
  threadId: string
  siteId: string
  organizationId: string
  locationId: string | null
  label: string
}

export type PendingWhatsAppReplyState =
  | {
      kind: 'confirm_send'
      threadId: string
      siteId: string
      organizationId: string
      replyBody: string
      guestEmailMasked: string
    }
  | {
      kind: 'disambiguate'
      candidates: DisambiguationCandidate[]
    }
  | {
      kind: 'collect_reply'
      threadId: string
      siteId: string
      organizationId: string
      guestEmailMasked: string
    }

export interface RoutingDecisionInput {
  /** message.context?.id was present on the inbound message. */
  hasQuotedContext: boolean
  /**
   * Result of resolving message.context.id → notifications.provider_message_id →
   * related_submission_type/id → guest_threads, plus isAuthorizedWhatsAppRecipient.
   * Only meaningful when hasQuotedContext is true. A notification match with no
   * guest thread yet, or an unauthorized sender, is 'unmatched' — never an error, just
   * falls through to the remaining tiers per issue #293 ("If no matching thread exists
   * yet, treat as unmatched rather than erroring").
   */
  quotedMatch: 'authorized_thread_found' | 'unmatched' | null
  /** Message text starts with the "ChowBot" directive (case-insensitive, optional colon). */
  isChowBotDirected: boolean
  /** Existing multi-turn state for this user's whatsapp channel, if any. */
  pendingState: PendingWhatsAppReplyState | null
  /** Count of candidate recent (24h) guest notifications for tier 3, scoped to the manager's authorized sites. */
  recentNotificationCount: number
  /** Raw trimmed inbound message text. */
  text: string
}

export type RoutingDecision =
  // Fresh dispatch (no pending state), tiers 1-4:
  | { action: 'start_confirm_send' }
  | { action: 'chowbot' }
  | { action: 'start_disambiguation' }
  | { action: 'ask_chowbot_or_quote' }
  // Resuming a pending confirm_send:
  | { action: 'confirm_send_execute' }
  | { action: 'confirm_send_cancel_and_redispatch' }
  // Resuming a pending disambiguate:
  | { action: 'disambiguation_pick'; index: number }
  | { action: 'disambiguation_cancel_and_redispatch' }
  // Resuming a pending collect_reply — any text becomes the reply body:
  | { action: 'collect_reply_body' }

const AFFIRMATIVE_PHRASES = new Set([
  'yes', 'y', 'yep', 'yeah', 'yup', 'confirm', 'confirmed', 'send', 'send it', 'ok', 'okay',
  'sure', 'go', 'go ahead', 'yes send', 'yes confirm', 'yes confirmed', 'yes please',
  'confirm send', 'send yes', 'ok send', 'ok confirm',
])

/**
 * Bounded affirmative matcher for the "reply YES to send" confirmation step. The FULL
 * normalized message must exactly match a known affirmative phrase — not just its first
 * word — so contradictory replies like "yes but change the date to Friday instead", "yes
 * no", or "sure don't" are never treated as confirmation. This intentionally does not try
 * to be a general sentiment classifier; it only needs to recognize the manager confirming
 * the exact prompt this flow just sent them.
 */
export function isAffirmativeReply(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  return AFFIRMATIVE_PHRASES.has(normalized)
}

/** True when `text` is (only) the "ChowBot" directive, with or without a trailing colon/message. */
export function isChowBotDirective(text: string): boolean {
  return /^chowbot\b/i.test(text.trim())
}

/** Strips a leading "ChowBot" / "ChowBot: " prefix, leaving the rest of the message for the assistant. */
export function stripChowBotPrefix(text: string): string {
  return text.trim().replace(/^chowbot\s*:?\s*/i, '').trim()
}

/**
 * Parses a 1-based numeric selection against a candidate list, e.g. for picking one of
 * up to 5 disambiguation options. Returns null for anything that isn't a bare in-range
 * integer — out-of-range or non-numeric text is never guessed at, per issue #293's "never
 * silently route ambiguous text" rule.
 */
export function parseNumericSelection(text: string, candidateCount: number): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (n < 1 || n > candidateCount) return null
  return n
}

/**
 * Masked email for the manager-facing pre-send disclosure (issue #293: "identify the
 * destination address in masked form"). Deliberately local to this file rather than
 * reusing utils/phone.ts's formatForDisplay, which masks phone numbers, not emails.
 */
export function maskEmailForDisplay(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  return `${local.slice(0, 1)}***@${domain}`
}

export function buildDisambiguationPrompt(candidates: DisambiguationCandidate[]): string {
  const lines = candidates.map((c, i) => `${i + 1}. ${c.label}`)
  return [
    'Reply to which?',
    ...lines,
    `Or reply "ChowBot" to talk to the assistant instead.`,
  ].join('\n')
}

export function buildConfirmSendPrompt(guestEmailMasked: string): string {
  return `This reply will be emailed to ${guestEmailMasked}. Reply YES to send.`
}

export const REPLY_SENT_CONFIRMATION = 'Reply sent by email.'

export function buildReplyFailedMessage(error: string): string {
  return `Reply failed to send by email: ${error}`
}

export const ASK_CHOWBOT_OR_QUOTE_MESSAGE =
  'Did you want to talk to ChowBot? Reply "ChowBot" to start, or quote a notification to reply to a guest.'

export function buildCollectReplyPrompt(guestEmailMasked: string): string {
  return `Type your reply now — it will be emailed to ${guestEmailMasked}.`
}

/**
 * The pure four-tier + pending-state decision tree. All I/O (notification/thread
 * lookups, authorization, sends, state persistence) happens in the caller; this
 * function only decides *what should happen* given the resolved inputs.
 */
export function decideWhatsAppReplyRouting(input: RoutingDecisionInput): RoutingDecision {
  const { pendingState, text } = input

  if (pendingState) {
    if (pendingState.kind === 'confirm_send') {
      return isAffirmativeReply(text)
        ? { action: 'confirm_send_execute' }
        : { action: 'confirm_send_cancel_and_redispatch' }
    }
    if (pendingState.kind === 'disambiguate') {
      const index = parseNumericSelection(text, pendingState.candidates.length)
      return index !== null
        ? { action: 'disambiguation_pick', index }
        : { action: 'disambiguation_cancel_and_redispatch' }
    }
    // collect_reply: any non-empty text becomes the reply body and moves to confirm_send.
    return { action: 'collect_reply_body' }
  }

  // Tier 1: quoted operational notification.
  if (input.hasQuotedContext && input.quotedMatch === 'authorized_thread_found') {
    return { action: 'start_confirm_send' }
  }

  // Tier 2: explicit ChowBot directive (including a quoted message that didn't match
  // anything in tier 1 but is otherwise ChowBot-directed).
  if (input.isChowBotDirected) {
    return { action: 'chowbot' }
  }

  // Tier 3: unquoted text with recent guest notifications in scope.
  if (input.recentNotificationCount > 0) {
    return { action: 'start_disambiguation' }
  }

  // Tier 4: unquoted text, no relevant guest context — never silently assume ChowBot.
  return { action: 'ask_chowbot_or_quote' }
}
