import EmailReplyParser from 'email-reply-parser'
import { compile } from 'html-to-text'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { getGuestRequest, requestSummary } from '~/server/domain/requests'
import { appendEntry } from '~/server/domain/guest-threads/entries'
import { updateThreadProjectionIfLatestEntry } from '~/server/domain/guest-threads/repository'
import type { CloudflareEnv } from '~/server/utils/auth'
import { notifyGuestThreadReply } from '~/server/utils/notifications'
import { getSubmissionOrganization, verifyReplyToken, type SubmissionType } from '~/server/utils/submission-messages'

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
  if (!tokenIsValid) throw new Error('Invalid reply token')

  const db = env.DB
  const organization = await getSubmissionOrganization(db, email.submissionType, email.submissionId)
  if (!organization) throw new Error('Submission not found')

  const thread = await getGuestRequest(db, email.submissionId, undefined, email.submissionType)
  if (!thread) throw new Error('Submission not found')
  const entry = await appendEntry(db, {
    threadId: thread.id,
    kind: 'message',
    actorKind: 'guest',
    channel: 'email',
    body: email.body,
    dedupeKey: `email:${email.messageId}`,
  })

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
