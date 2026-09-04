import type { ConversationState } from './types'

/**
 * Pure conversation-state transition function implementing issue #442's Locked Decision
 * #5 transition table exactly. Every write path must call this explicitly — conversation
 * state is never inferred from raw message/source data anywhere else.
 */
export type ConversationTrigger =
  | { type: 'new_submission' }
  | { type: 'inbound_guest_message' }
  | { type: 'manual_resolve' }
  | { type: 'manual_reopen' }

export function nextConversationState(
  current: ConversationState,
  trigger: ConversationTrigger,
): ConversationState {
  switch (trigger.type) {
    case 'new_submission':
      return 'needs_attention'

    case 'inbound_guest_message':
      return 'needs_attention'

    case 'manual_resolve':
      return 'resolved'

    case 'manual_reopen':
      return 'needs_attention'

    default: {
      const exhaustive: never = trigger
      throw new Error(`Unhandled conversation trigger: ${JSON.stringify(exhaustive)}`)
    }
  }
}

export function isUnreadForMember(actorMemberId: string | null, currentMemberId: string): boolean {
  return actorMemberId !== currentMemberId
}
