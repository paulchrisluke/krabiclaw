import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { execute, queryAll, queryFirst } from '~/server/db'
import { clearAnalyticsIntegration } from './google-analytics'
import { clearSearchConsoleIntegration } from './google-search-console'
import { deleteMediaAsset } from './media-asset-manager'
import { reconcileZarazAnalytics } from './zaraz-analytics'

/**
 * Removing an organization's integration.
 *
 * An integration is the organization's selection — a GA4 property, a Search
 * Console site, a Facebook Page, an Instagram account — and the Better Auth
 * linked account it was made through. The linked account belongs to the user
 * who linked it: it may be how they sign in, and another organization may use
 * it. Releasing an organization's integration therefore removes only the
 * organization's state and never unlinks or revokes the account. Unlinking is
 * the user's own Better Auth action.
 *
 * Releasing one product owns:
 *
 * - the product's persisted selection;
 * - provider-derived content, when the caller is erasing rather than
 *   disconnecting (see `eraseProviderData`);
 * - the downstream reconciliation the removal implies, such as Zaraz;
 * - idempotency, so releasing something already gone is a no-op and not an
 *   error. Meta retries its callbacks, and a tenant can press Disconnect twice.
 *
 * Deleting an organization needs none of this: its row, and the selections
 * in it, go with it.
 */

export type IntegrationProduct =
  | 'google-analytics'
  | 'google-search-console'
  | 'facebook'
  | 'instagram'

export interface ReleaseIntegrationOptions {
  /**
   * Also destroy what was imported from the provider — the posts and images
   * synced from a Facebook Page or an Instagram account.
   *
   * A tenant pressing Disconnect keeps them: they are published content on the
   * tenant's own website, which they may have edited, and stopping a sync is
   * not a request to unpublish. A Meta data-deletion request is the opposite
   * ask, and sets this.
   */
  eraseProviderData?: boolean
  /** Recorded on the media rows the erase removes. */
  actorUserId?: string | null
}

export interface ReleaseIntegrationResult {
  product: IntegrationProduct
  /** False when there was nothing connected — the call still succeeded. */
  released: boolean
  /** Provider-derived documents destroyed, when erasing. */
  erasedDocuments: number
}

/** Which `integrations_json` key a product owns. */
const PRODUCT_KEY: Record<IntegrationProduct, string> = {
  'google-analytics': 'google_analytics',
  'google-search-console': 'google_search_console',
  'facebook': 'facebook',
  'instagram': 'instagram',
}

/**
 * Deletes what a provider's sync created: the media assets placed on the
 * imported documents, through the media manager so the R2 objects and
 * Cloudflare Images go too, and then the documents.
 *
 * Assets first: an asset that will not delete stops the erase with the
 * documents still naming it, so the retry — Meta redelivers — finds it again.
 * Deleting the documents first left nothing to find it by.
 */
async function eraseImportedContent(
  env: CloudflareEnv,
  organizationId: string,
  channel: 'facebook' | 'instagram',
  actorUserId: string | null,
): Promise<number> {
  const documents = await queryAll<{ id: string }>(env.DB, `
    SELECT id FROM content_documents
     WHERE organization_id = ?
       AND (metadata_json ->> ?) IS NOT NULL
  `, [organizationId, `$.channels.${channel}.provider_post_id`])
  if (!documents.length) return 0

  const ids = documents.map(document => document.id)
  const placeholders = ids.map(() => '?').join(', ')
  const assets = await queryAll<{ asset_id: string }>(env.DB, `
    SELECT DISTINCT asset_id FROM media_placements
     WHERE organization_id = ? AND owner_type = 'content_document' AND owner_id IN (${placeholders})
  `, [organizationId, ...ids])

  const failures: Error[] = []
  for (const { asset_id: assetId } of assets) {
    await deleteMediaAsset(env.DB, env, assetId, organizationId, actorUserId)
      .catch((error: unknown) => failures.push(new Error(`media asset ${assetId}`, { cause: error })))
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} imported ${channel} media asset(s) could not be deleted`)

  await execute(env.DB, `DELETE FROM content_documents WHERE organization_id = ? AND id IN (${placeholders})`,
    [organizationId, ...ids])
  return documents.length
}

export async function releaseIntegration(
  env: CloudflareEnv,
  organizationId: string,
  product: IntegrationProduct,
  options: ReleaseIntegrationOptions = {},
): Promise<ReleaseIntegrationResult> {
  const key = PRODUCT_KEY[product]

  const present = await queryFirst<{ connected: number }>(env.DB, `
    SELECT json_extract(integrations_json, ?) IS NOT NULL AS connected
      FROM organization WHERE id = ? LIMIT 1
  `, [`$.${key}`, organizationId])
  const released = Boolean(present?.connected)

  let erasedDocuments = 0
  if (options.eraseProviderData && (product === 'facebook' || product === 'instagram')) {
    erasedDocuments = await eraseImportedContent(env, organizationId, product, options.actorUserId ?? null)
  }

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

  return { product, released, erasedDocuments }
}

/**
 * Meta's deauthorize and data-deletion callbacks name a person, not a site:
 * the Facebook or Instagram user who removed KrabiClaw from their Meta
 * settings. That ends the authorization behind the Better Auth account Meta's
 * id belongs to, so every organization connected through that account loses
 * its integration and the dead account is removed from its user.
 *
 * This is the one place an account is removed rather than left to its user:
 * Meta has already revoked it.
 */
export async function releaseMetaUserIntegrations(
  env: CloudflareEnv,
  metaUserId: string,
  options: ReleaseIntegrationOptions = {},
): Promise<ReleaseIntegrationResult[]> {
  const context = await createAuth(env).$context
  const results: ReleaseIntegrationResult[] = []
  for (const product of ['facebook', 'instagram'] as const) {
    const account = await context.internalAdapter.findAccountByKey({ providerId: product, accountId: metaUserId })
    if (!account) continue

    const organizations = await queryAll<{ id: string }>(env.DB, `
      SELECT id FROM organization WHERE json_extract(integrations_json, ?) = ?
    `, [`$.${product}.account_id`, account.id])
    for (const organization of organizations) {
      results.push(await releaseIntegration(env, organization.id, product, options))
    }
    await context.internalAdapter.deleteAccount(account.id)
  }
  return results
}
