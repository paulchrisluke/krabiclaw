import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { getAdapter } from '~/server/domain/guest-threads/adapters/registry'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { ensureGuestThread, updateThreadProjectionIfLatestEntry } from '~/server/domain/guest-threads/repository'
import { nextConversationState } from '~/server/domain/guest-threads/state-machine'
import type { CloudflareEnv } from '~/server/utils/auth'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import { getSubmissionOrgSite, verifyReplyToken, type SubmissionType } from '~/server/utils/submission-messages'

export interface InboundGuestEmail {
  submissionType: SubmissionType
  submissionId: string
  token: string
  body: string
  messageId: string
}

export async function receiveGuestEmail(env: CloudflareEnv, email: InboundGuestEmail): Promise<void> {
  const tokenIsValid = await verifyReplyToken(
    env,
    email.submissionType,
    email.submissionId,
    email.token,
  )
  if (!tokenIsValid) throw new Error('Invalid reply token')

  const db = env.DB
  const orgSite = await getSubmissionOrgSite(db, email.submissionType, email.submissionId)
  if (!orgSite) throw new Error('Submission not found')

  const adapter = getAdapter(email.submissionType)
  const thread = await ensureGuestThread(db, adapter, email.submissionId)
  const entry = await appendEntry(db, {
    threadId: thread.id,
    kind: 'message',
    actorKind: 'guest',
    channel: 'email',
    body: email.body,
    dedupeKey: `email:${email.messageId}`,
  })

  const conversationState = nextConversationState(
    thread.conversation_state,
    { type: 'inbound_guest_message' },
  )
  await updateThreadProjectionIfLatestEntry(db, thread.id, entry.id, { conversationState })

  try {
    const source = await adapter.loadSource({ db }, email.submissionId)
    if (source) {
      const summary = adapter.summarize(source)
      await notifyGuestThreadReply(env, db, {
        organizationId: orgSite.organizationId,
        siteId: orgSite.siteId,
        locationId: summary.locationId,
        threadId: thread.id,
        sourceEntryId: entry.id,
        submissionType: email.submissionType,
        submissionId: email.submissionId,
        guestName: summary.guestName,
        guestEmail: summary.guestEmail,
        guestPhone: summary.guestPhone,
        inboundChannel: 'email',
        messagePreview: email.body,
      })
    }
  } catch (error) {
    console.error('email_inbound_owner_notification_failed', {
      submissionType: email.submissionType,
      submissionId: email.submissionId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  await publishGuestInboxThreadEvent(env, db, {
    threadId: thread.id,
    type: 'entry.appended',
  })
}
