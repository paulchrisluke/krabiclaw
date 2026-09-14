import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { renderEmail } from '~/server/emails/vue-email'
import { getPlatformSite } from '~/server/utils/platform-site'
import { getPlatformDomain } from '~/server/utils/dashboard-notification-links'
import { sendEmail, type EmailDeliveryMode } from '~/server/utils/email-delivery'
import { buildUnsubscribeUrl } from '~/server/utils/unsubscribe'
import { wantsCategoryEmailSql } from '~/server/domain/notification-preferences'
import { collectionArticlePath } from '~/utils/article-collections'
import { coverJoinSql } from '~/server/utils/content/cover'
import PlatformArticleAnnouncement from '~/server/emails/templates/PlatformArticleAnnouncement'

export interface BroadcastEnv {
  EMAIL_REPLY_SECRET?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
  RESEND_API_KEY?: string
  EMAIL_FROM?: string
  EMAIL_DELIVERY_MODE?: EmailDeliveryMode | string
}

/**
 * How recently an article must have first gone public to be worth announcing.
 *
 * The task derives its own work rather than being called from a publish
 * endpoint, because an article reaches `published` two ways — immediately
 * through updateBlogLifecycle, and later through blog-scheduled-publish — and
 * enqueuing from both writers would be two implementations of one rule. The
 * window is what stops the whole existing back catalogue mailing out the first
 * time this ships.
 */
const ANNOUNCEABLE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Sends per tick, so one run cannot exhaust the Worker's subrequest budget. */
export const BROADCAST_SENDS_PER_RUN = 50

const BROADCAST_CATEGORY = 'product_news' as const

export interface AnnounceableArticle {
  id: string
  title: string
  slug: string
  summary: string | null
  category: string | null
  cover_public_url: string | null
}

/**
 * The next platform article that has gone public and has no broadcast yet.
 *
 * Only the `blog` collection: `docs` is reference material that is edited
 * continuously, and announcing every documentation edit is not what a reader
 * signed up for.
 */
export async function findAnnounceableArticle(db: DbClient, now = new Date()): Promise<AnnounceableArticle | null> {
  const platformSiteId = (await getPlatformSite(db)).id
  const since = new Date(now.getTime() - ANNOUNCEABLE_WINDOW_MS).toISOString()
  // The leading image is joined through the shared helper rather than a second
  // hand-written join: the cover lives on a media_placement, and writing that
  // out again here is how this query first asked for a column that does not exist.
  return queryFirst<AnnounceableArticle>(db, `
    SELECT p.id, p.title, p.slug, p.summary, (p.metadata_json ->> '$.category') AS category,
           cover_asset.public_url AS cover_public_url
      FROM content_documents p
      ${coverJoinSql('p')}
     WHERE p.kind = 'article' AND p.row_role = 'root' AND p.site_id = ?
       AND p.status = 'published' AND p.visibility = 'public'
       AND (p.metadata_json ->> '$.collection') = 'blog'
       AND p.first_published_at IS NOT NULL AND p.first_published_at >= ?
       AND NOT EXISTS (SELECT 1 FROM broadcasts b WHERE b.content_document_id = p.id)
     ORDER BY p.first_published_at ASC
     LIMIT 1
  `, [platformSiteId, since])
}

/**
 * Claims the broadcast for an article. The unique content_document_id is what
 * makes a republish, or two ticks overlapping, not mail everyone twice: the
 * second insert changes nothing and the existing row is returned.
 */
export async function claimBroadcast(db: DbClient, contentDocumentId: string): Promise<string> {
  await execute(
    db,
    `INSERT INTO broadcasts (id, content_document_id, category, created_at)
     VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (content_document_id) DO NOTHING`,
    [crypto.randomUUID(), contentDocumentId, BROADCAST_CATEGORY],
  )
  const row = await queryFirst<{ id: string }>(db, 'SELECT id FROM broadcasts WHERE content_document_id = ?', [contentDocumentId])
  if (!row) throw new Error(`Broadcast for ${contentDocumentId} was not claimed`)
  return row.id
}

interface RecipientRow {
  id: string
  email: string
}

/**
 * Tenants who have not yet been sent this broadcast and still want the
 * category.
 *
 * Anonymous, banned, unverified and deletion-scheduled accounts are excluded:
 * none of them is a person who asked to hear from us, and mailing an unverified
 * address is how a sending domain's reputation goes.
 */
export async function listPendingRecipients(db: DbClient, broadcastId: string, limit: number): Promise<RecipientRow[]> {
  const wants = wantsCategoryEmailSql('u.id', BROADCAST_CATEGORY)
  return queryAll<RecipientRow>(db, `
    SELECT u.id, u.email
      FROM user u
     WHERE u.emailVerified = 1
       AND u.isAnonymous = 0
       AND COALESCE(u.banned, 0) = 0
       AND u.deletionScheduledAt IS NULL
       AND ${wants.sql}
       AND NOT EXISTS (SELECT 1 FROM broadcast_deliveries d WHERE d.broadcast_id = ? AND d.user_id = u.id)
     ORDER BY u.createdAt ASC
     LIMIT ?
  `, [...wants.params, broadcastId, limit])
}

/**
 * A broadcast that still has someone left to mail.
 *
 * Checked before a new article is claimed. Claiming inserts the `broadcasts`
 * row, which is also what excludes the article from findAnnounceableArticle —
 * so without this, the first tick would send one batch and every recipient
 * past BROADCAST_SENDS_PER_RUN would never be mailed at all.
 */
export async function findResumableBroadcast(db: DbClient): Promise<{ id: string; content_document_id: string } | null> {
  const wants = wantsCategoryEmailSql('u.id', BROADCAST_CATEGORY)
  return queryFirst<{ id: string; content_document_id: string }>(db, `
    SELECT b.id, b.content_document_id
      FROM broadcasts b
     WHERE EXISTS (
       SELECT 1 FROM user u
        WHERE u.emailVerified = 1 AND u.isAnonymous = 0 AND COALESCE(u.banned, 0) = 0 AND u.deletionScheduledAt IS NULL
          AND ${wants.sql}
          AND NOT EXISTS (SELECT 1 FROM broadcast_deliveries d WHERE d.broadcast_id = b.id AND d.user_id = u.id)
     )
     ORDER BY b.created_at ASC
     LIMIT 1
  `, wants.params)
}

/** The article a claimed broadcast refers to, for rendering the next batch. */
export async function loadBroadcastArticle(db: DbClient, contentDocumentId: string): Promise<AnnounceableArticle | null> {
  return queryFirst<AnnounceableArticle>(db, `
    SELECT p.id, p.title, p.slug, p.summary, (p.metadata_json ->> '$.category') AS category,
           cover_asset.public_url AS cover_public_url
      FROM content_documents p
      ${coverJoinSql('p')}
     WHERE p.id = ?
  `, [contentDocumentId])
}

export async function recordBroadcastDelivery(
  db: DbClient,
  input: { broadcastId: string; userId: string; status: 'sent' | 'failed'; providerMessageId?: string | null; error?: string | null },
): Promise<void> {
  await execute(
    db,
    `INSERT INTO broadcast_deliveries (broadcast_id, user_id, status, provider_message_id, error, sent_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (broadcast_id, user_id) DO NOTHING`,
    [input.broadcastId, input.userId, input.status, input.providerMessageId ?? null, input.error ?? null],
  )
}

export interface BroadcastRunResult {
  broadcast_id: string | null
  article_id: string | null
  sent: number
  failed: number
  skipped?: string
}

/**
 * One tick: find an article worth announcing, claim it, and mail the next batch
 * of recipients. A tick that dies part-way leaves the delivery rows it already
 * wrote, so the next tick resumes rather than restarting.
 */
export async function runArticleBroadcast(db: DbClient, env: BroadcastEnv, now = new Date()): Promise<BroadcastRunResult> {
  // Finish what is already in flight before starting anything new, so a
  // recipient list longer than one batch is actually drained.
  const resumable = await findResumableBroadcast(db)
  const claimed = resumable
    ? { broadcastId: resumable.id, article: await loadBroadcastArticle(db, resumable.content_document_id) }
    : await (async () => {
        const article = await findAnnounceableArticle(db, now)
        return article ? { broadcastId: await claimBroadcast(db, article.id), article } : null
      })()

  if (!claimed) return { broadcast_id: null, article_id: null, sent: 0, failed: 0, skipped: 'no article to announce' }
  const { broadcastId, article } = claimed
  if (!article) throw new Error(`Broadcast ${broadcastId} refers to an article that is gone`)

  const recipients = await listPendingRecipients(db, broadcastId, BROADCAST_SENDS_PER_RUN)
  if (recipients.length === 0) {
    return { broadcast_id: broadcastId, article_id: article.id, sent: 0, failed: 0, skipped: 'no pending recipients' }
  }

  const platformDomain = getPlatformDomain(env)
  const articleUrl = `https://${platformDomain}${collectionArticlePath('blog', article.category, article.slug)}`

  let sent = 0
  let failed = 0
  for (const recipient of recipients) {
    const unsubscribeUrl = await buildUnsubscribeUrl(env, { userId: recipient.id, category: BROADCAST_CATEGORY })
    if (!unsubscribeUrl) throw new Error('EMAIL_REPLY_SECRET is required to send a broadcast')

    const rendered = await renderEmail(PlatformArticleAnnouncement, {
      title: article.title,
      summary: article.summary,
      coverImageUrl: article.cover_public_url,
      articleUrl,
      unsubscribeUrl,
      platformDomain,
    })
    const result = await sendEmail(env, {
      to: recipient.email,
      subject: article.title,
      html: rendered.html,
      text: rendered.text,
      unsubscribeUrl,
      idempotencyKey: `broadcast:${broadcastId}:${recipient.id}`,
    })
    // An 'unknown' outcome is not recorded: the send may still have landed, so
    // the next tick retries it rather than the recipient silently losing it.
    if (result.status === 'sent') {
      sent += 1
      await recordBroadcastDelivery(db, { broadcastId, userId: recipient.id, status: 'sent', providerMessageId: result.messageId })
    } else if (result.status === 'failed') {
      failed += 1
      await recordBroadcastDelivery(db, { broadcastId, userId: recipient.id, status: 'failed', error: result.error })
    }
  }

  return { broadcast_id: broadcastId, article_id: article.id, sent, failed }
}
