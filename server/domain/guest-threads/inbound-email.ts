import EmailReplyParser from 'email-reply-parser'
import { compile } from 'html-to-text'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { getGuestRequest, requestSummary } from '~/server/domain/requests'
import { appendEntry, GuestThreadEntryDedupeConflictError } from '~/server/domain/guest-threads/entries'
import { updateThreadProjectionIfLatestEntry } from '~/server/domain/guest-threads/repository'
import type { GuestThreadEntryRow } from '~/server/domain/guest-threads/types'
import type { CloudflareEnv } from '~/server/utils/auth'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import { getSubmissionOrganization, verifyReplyToken, type SubmissionType } from '~/server/utils/submission-messages'

/**
 * An inbound email that delivering again cannot make acceptable. The message is
 * the bounce the sender reads, so it names the problem and nothing internal.
 * Any other error from receiving an email is one a later delivery may not hit.
 */
export class InboundEmailRejection extends Error {}

export interface InboundGuestEmail {
  submissionType: SubmissionType
  submissionId: string
  token: string
  body: string
  messageId: string
}

// A single-part HTML reply has no text/plain alternative. Quoted containers are
// skipped here; the reply parser below removes whatever quoting remains, so the
// HTML and plain-text paths share one quote parser.
const htmlToText = compile({
  wordwrap: false,
  selectors: [
    { selector: 'blockquote', format: 'skip' },
    { selector: '.gmail_quote', format: 'skip' },
    { selector: '.yahoo_quoted', format: 'skip' },
    { selector: 'img', format: 'skip' },
  ],
})

/**
 * The text the guest newly wrote in an inbound email: the mail client's quoted
 * copy of the thread and the guest's signature are removed. An empty result
 * means the email carried no new text.
 */
export function guestReplyText(mime: { text?: string, html?: string }): string {
  const text = mime.text || (mime.html ? htmlToText(mime.html) : '')
  return new EmailReplyParser().read(text).getVisibleText().trim()
}

export async function receiveGuestEmail(env: CloudflareEnv, email: InboundGuestEmail): Promise<void> {
  const tokenIsValid = await verifyReplyToken(
    env,
    email.submissionType,
    email.submissionId,
    email.token,
  )
  if (!tokenIsValid) throw new InboundEmailRejection('This reply address is not valid.')

  const db = env.DB
  const organization = await getSubmissionOrganization(db, email.submissionType, email.submissionId)
  if (!organization) throw new InboundEmailRejection('This conversation no longer exists.')

  const thread = await getGuestRequest(db, email.submissionId, undefined, email.submissionType)
  if (!thread) throw new InboundEmailRejection('This conversation no longer exists.')

  // A reply with nothing newly written (only the quoted thread or a signature)
  // is accepted and records nothing.
  if (!email.body) return

  let entry: GuestThreadEntryRow
  try {
    entry = await appendEntry(db, {
      threadId: thread.id,
      kind: 'message',
      actorKind: 'guest',
      channel: 'email',
      body: email.body,
      dedupeKey: `email:${email.messageId}`,
    })
  } catch (error) {
    if (error instanceof GuestThreadEntryDedupeConflictError) {
      throw new InboundEmailRejection('A different message with this Message-ID was already received.')
    }
    throw error
  }

  await updateThreadProjectionIfLatestEntry(db, thread.id, entry.id, { conversationState: 'needs_attention' })

  try {
    const source = thread
    if (source) {
      const summary = await requestSummary(db, source)
      await notifyGuestThreadReply(env, db, {
        organizationId: organization.organizationId,
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
