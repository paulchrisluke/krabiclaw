import type { ConversationState } from './types'

/**
 * Pure conversation-state transition function implementing issue #442's Locked Decision
 * #5 transition table exactly. Every write path must call this explicitly — conversation
 * state is never inferred from raw message/source data anywhere else.
 */
export type ConversationTrigger =
  | { type: 'new_submission' }
  | { type: 'inbound_guest_message' }
  | { type: 'owner_reply_sent' }
  | { type: 'manual_resolve' }
  | { type: 'manual_reopen' }
  | { type: 'operation_succeeded'; notificationOutcome: 'not_required' | 'queued' | 'sent' | 'failed' }

export function nextConversationState(
  current: ConversationState,
  trigger: ConversationTrigger,
): ConversationState {
  switch (trigger.type) {
    case 'new_submission':
      return 'needs_attention'

    case 'inbound_guest_message':
      // Guest replies after resolution automatically reopen, without altering
      // operational status. This also covers the plain "guest sends a message" case
      // while the thread is already in any other state.
      return 'needs_attention'

    case 'owner_reply_sent':
      return 'waiting_on_guest'

    case 'manual_resolve':
      return 'resolved'

    case 'manual_reopen':
      return 'needs_attention'

    case 'operation_succeeded':
      // Automated transactional sends never produce waiting_on_guest — that state is
      // reserved for a human owner reply awaiting a guest response.
      if (trigger.notificationOutcome === 'failed') return 'needs_attention'
      return 'resolved'

    default: {
      const exhaustive: never = trigger
      throw new Error(`Unhandled conversation trigger: ${JSON.stringify(exhaustive)}`)
    }
  }
}

/** Whether an inbound guest message should count as unread for a given member. */
export function isUnreadForMember(actorMemberId: string | null, currentMemberId: string): boolean {
  return actorMemberId !== currentMemberId
}
