import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { deleteContentBlock, prepareContentDocumentDeletion } from '~/server/utils/content/documents'
import { clearAnalyticsIntegration } from './google-analytics'
import { clearSearchConsoleIntegration } from './google-search-console'
import { deleteMediaAsset } from './media-asset-manager'
import type { VerifiedMetaRequest } from './meta-graph'
import { publicResourceCacheInvalidationQuery } from './public-resource-cache'
import { reconcileZarazAnalytics } from './zaraz-analytics'

/**
 * Removing an organization's integration, and what Meta's callbacks ask for.
 *
 * An integration is the organization's selection — a GA4 property, a Search
 * Console site, a Facebook Page, an Instagram account — and the Better Auth
 * linked account it was made through. Disconnecting removes the selection and
 * stops the sync; the website keeps every post, including imported ones, and
 * the linked account stays its user's. Releasing something already gone is a
 * no-op: Meta retries its callbacks, and a tenant can press Disconnect twice.
 *
 * A Meta data-deletion request is different: it names one person in one Meta
 * app, and erases what was imported from them — found through the provenance
 * `post_publications` keeps, so it still works after the connection and the
 * linked account are gone. What the tenant wrote themselves is never erased.
 */

export type IntegrationProduct =
  | 'google-analytics'
  | 'google-search-console'
  | 'facebook'
  | 'instagram'

export interface ReleaseIntegrationResult {
  product: IntegrationProduct
  /** False when there was nothing connected — the call still succeeded. */
  released: boolean
}

const PRODUCT_KEY: Record<IntegrationProduct, string> = {
  'google-analytics': 'google_analytics',
  'google-search-console': 'google_search_console',
  'facebook': 'facebook',
  'instagram': 'instagram',
}

export async function releaseIntegration(
  env: CloudflareEnv,
  organizationId: string,
  product: IntegrationProduct,
): Promise<ReleaseIntegrationResult> {
  const key = PRODUCT_KEY[product]
  const present = await queryFirst<{ connected: number }>(env.DB, `
    SELECT json_extract(integrations_json, ?) IS NOT NULL AS connected
      FROM organization WHERE id = ? LIMIT 1
  `, [`$.${key}`, organizationId])
  const released = Boolean(present?.connected)

  if (product === 'google-analytics') {
    await clearAnalyticsIntegration(env, organizationId)
  } else if (product === 'google-search-console') {
    await clearSearchConsoleIntegration(env, organizationId)
  } else {
    await execute(env.DB, `
      UPDATE organization SET integrations_json = json_remove(integrations_json, ?)
      WHERE id = ?
    `, [`$.${key}`, organizationId])
  }

  // Zaraz serves the measurement id of connected sites, so losing Analytics
  // has to withdraw the tag rather than keep collecting for a tenant who
  // disconnected. The disconnect has not taken effect until it has.
  if (product === 'google-analytics' && released) await reconcileZarazAnalytics(env, env.DB)

  return { product, released }
}

/**
 * Meta ended one person's authorization of one app. Every organization
 * connected through that person's linked account loses the selection, and the
 * dead linked account is removed — Meta has already revoked it. Content stays.
 */
export async function deauthorizeMetaSubject(env: CloudflareEnv, subject: VerifiedMetaRequest): Promise<ReleaseIntegrationResult[]> {
  const context = await createAuth(env).$context
  const account = await context.internalAdapter.findAccountByKey({ providerId: subject.channel, accountId: subject.providerSubjectId })
  if (!account) return []
  const organizations = await queryAll<{ id: string }>(env.DB, 'SELECT id FROM organization WHERE json_extract(integrations_json, ?) = ?',
    [`$.${subject.channel}.account_id`, account.id])
  const results: ReleaseIntegrationResult[] = []
  for (const organization of organizations) results.push(await releaseIntegration(env, organization.id, subject.channel))
  await context.internalAdapter.deleteAccount(account.id)
  return results
}

export interface MetaErasureResult {
  erased_documents: number
  erased_media: number
  detached_publications: number
  remaining: number
}

interface SubjectPublication { id: string; organization_id: string; post_id: string | null; origin: 'import' | 'publish' }

/** What still names this Meta person: provider identifiers and their linked account. */
export async function remainingMetaSubjectData(env: CloudflareEnv, subject: Pick<VerifiedMetaRequest, 'channel' | 'providerAppId' | 'providerSubjectId'>): Promise<number> {
  const row = await queryFirst<{ n: number }>(env.DB, 'SELECT count(*) AS n FROM post_publications WHERE channel = ? AND provider_app_id = ? AND provider_subject_id = ?',
    [subject.channel, subject.providerAppId, subject.providerSubjectId])
  const context = await createAuth(env).$context
  const account = await context.internalAdapter.findAccountByKey({ providerId: subject.channel, accountId: subject.providerSubjectId })
  return Number(row?.n ?? 0) + (account ? 1 : 0)
}

/**
 * Erases what was imported from one verified Meta person, in every
 * organization, through the canonical deletion paths:
 *
 * 1. provider-origin media, wherever it was reused: its placements on other
 *    documents go (an image block left with nothing to show goes with it, and
 *    a published post left with nothing to publish becomes a draft), then the
 *    asset and its stored objects;
 * 2. the documents imported from them, translations included — however the
 *    tenant edited the copy, it began as an import;
 * 3. publications of the tenant's own posts *to* this person's Page or account
 *    lose only the association; the posts and their media stay;
 * 4. the provider identifiers, last, once everything above succeeded.
 *
 * Any failure throws, and the identifiers remain so a retry finds the rest.
 */
export async function eraseMetaSubjectData(env: CloudflareEnv, subject: VerifiedMetaRequest): Promise<MetaErasureResult> {
  const db = env.DB as DbClient
  await deauthorizeMetaSubject(env, subject)
  const publications = await queryAll<SubjectPublication>(db, `SELECT id, organization_id, post_id, origin FROM post_publications
    WHERE channel = ? AND provider_app_id = ? AND provider_subject_id = ? ORDER BY organization_id, id`,
  [subject.channel, subject.providerAppId, subject.providerSubjectId])
  const result: MetaErasureResult = { erased_documents: 0, erased_media: 0, detached_publications: 0, remaining: 0 }

  for (const publication of publications.filter(item => item.origin === 'import')) {
    const assets = await queryAll<{ id: string }>(db, 'SELECT id FROM media_assets WHERE organization_id = ? AND origin_publication_id = ?', [publication.organization_id, publication.id])
    for (const asset of assets) {
      await removeReusedPlacements(env, publication.organization_id, asset.id, publication.post_id)
      await deleteMediaAsset(db, env, asset.id, publication.organization_id, null)
      // A deleted asset row keeps its id for audit; it no longer names the publication.
      await execute(db, 'UPDATE media_assets SET origin_publication_id = NULL WHERE organization_id = ? AND id = ?', [publication.organization_id, asset.id])
      result.erased_media += 1
    }
    if (publication.post_id) {
      await executeBatch(db, [
        { query: 'UPDATE post_publications SET post_id = NULL, updated_at = ? WHERE id = ?', params: [new Date().toISOString(), publication.id] },
        ...prepareContentDocumentDeletion({ documentId: publication.post_id, organizationId: publication.organization_id }),
      ])
      result.erased_documents += 1
    }
  }
  const touched = [...new Set(publications.map(item => item.organization_id))]
  if (publications.length) {
    await executeBatch(db, [
      { query: 'DELETE FROM post_publications WHERE channel = ? AND provider_app_id = ? AND provider_subject_id = ?', params: [subject.channel, subject.providerAppId, subject.providerSubjectId] },
      ...touched.map(organizationId => publicResourceCacheInvalidationQuery(organizationId, 'meta-data-deletion')),
    ])
  }
  result.detached_publications = publications.filter(item => item.origin === 'publish').length
  result.remaining = await remainingMetaSubjectData(env, subject)
  if (result.remaining !== 0) throw new Error(`Meta data deletion left ${result.remaining} record(s) naming ${subject.channel} subject ${subject.providerSubjectId}`)
  return result
}

/**
 * Before a provider asset goes, the other places it was reused let go of it:
 * an image block showing only it is removed from its document, and a
 * published post that would be left with nothing to publish is unpublished.
 */
async function removeReusedPlacements(env: CloudflareEnv, organizationId: string, assetId: string, importedPostId: string | null) {
  const db = env.DB as DbClient
  const blocks = await queryAll<{ id: string; updated_at: string; remaining: number }>(db, `SELECT b.id, b.updated_at,
      (SELECT count(*) FROM media_placements other WHERE other.owner_type = 'content_block' AND other.owner_id = b.id AND other.asset_id <> ?) AS remaining
    FROM media_placements p JOIN content_blocks b ON b.id = p.owner_id
    WHERE p.organization_id = ? AND p.owner_type = 'content_block' AND p.asset_id = ? AND b.type = 'image'`, [assetId, organizationId, assetId])
  for (const block of blocks.filter(item => item.remaining === 0)) await deleteContentBlock(db, block.id, { expected_updated_at: block.updated_at })
  const posts = await queryAll<{ id: string }>(db, `SELECT DISTINCT d.id FROM media_placements p JOIN content_documents d ON d.id = p.owner_id
    WHERE p.organization_id = ? AND p.owner_type = 'content_document' AND p.asset_id = ? AND d.kind = 'social_post' AND d.row_role = 'root'
      AND d.status = 'published' AND d.id IS NOT ?
      AND trim(coalesce(d.summary, '')) = '' AND json_type(d.metadata_json, '$.call_to_action') IS NULL
      AND NOT EXISTS (SELECT 1 FROM media_placements other WHERE other.owner_type = 'content_document' AND other.owner_id = d.id
        AND other.slot IN ('cover', 'gallery') AND other.asset_id <> ?)`, [organizationId, assetId, importedPostId, assetId])
  for (const post of posts) {
    await executeBatch(db, [
      { query: `UPDATE content_documents SET status = 'draft', published_at = NULL, updated_at = ? WHERE id = ? AND organization_id = ?`, params: [new Date().toISOString(), post.id, organizationId] },
      publicResourceCacheInvalidationQuery(organizationId, 'meta-data-deletion-unpublish'),
    ])
  }
}
