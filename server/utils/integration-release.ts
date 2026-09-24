import type { CloudflareEnv } from '~/server/utils/auth'
import { execute, queryAll, queryFirst } from '~/server/db'
import { clearAnalyticsIntegration } from './google-analytics'
import { clearSearchConsoleIntegration } from './google-search-console'
import { releaseGoogleCredential } from './google-credential'
import { getFacebookPagesConnection, revokeFacebookAuthorization } from './facebook-pages'
import { readInstagramConnection, revokeInstagramAuthorization } from './instagram'
import { deleteMediaAsset } from './media-asset-manager'
import { reconcileZarazAnalytics } from './zaraz-analytics'

/**
 * The one way an integration is released.
 *
 * Every removal path ends here: the dashboard's Disconnect, Meta's
 * deauthorization and data-deletion callbacks, and tenant deletion. Those are
 * different ways of *asking*; what has to happen afterwards is the same, and
 * when it lived in each caller the answers drifted — the old Analytics
 * disconnect wrote a disabled stub instead of removing the record, and nothing
 * anywhere revoked a provider credential.
 *
 * Releasing one product owns all of it:
 *
 * - the product's own persisted connection and state;
 * - the provider credential, revoked when no remaining integration needs it;
 * - provider-derived content, when the caller is erasing rather than
 *   disconnecting (see `eraseProviderData`);
 * - the downstream reconciliation the removal implies, such as Zaraz;
 * - idempotency, so releasing something already gone is a no-op and not an
 *   error. Meta retries its callbacks, and a tenant can press Disconnect twice.
 *
 * Google Analytics and Google Search Console share one credential, so each
 * removes only its own state and the credential goes when neither remains.
 * Facebook and Instagram hold separate tokens and release independently.
 */

export type IntegrationProduct =
  | 'google-analytics'
  | 'google-search-console'
  | 'facebook'
  | 'instagram'

export const INTEGRATION_PRODUCTS: readonly IntegrationProduct[] = [
  'google-analytics',
  'google-search-console',
  'facebook',
  'instagram',
] as const

export function isIntegrationProduct(value: unknown): value is IntegrationProduct {
  return typeof value === 'string' && (INTEGRATION_PRODUCTS as readonly string[]).includes(value)
}

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
  /** Non-fatal provider failures. A provider that will not answer must not keep a tenant connected. */
  warnings: string[]
}

/** Which `integrations_json` key a product owns. */
const PRODUCT_KEY: Record<IntegrationProduct, string> = {
  'google-analytics': 'google_analytics',
  'google-search-console': 'google_search_console',
  'facebook': 'facebook',
  'instagram': 'instagram',
}

/** The `metadata_json` channel a provider's imported posts are tagged with. */
const PRODUCT_CHANNEL: Partial<Record<IntegrationProduct, string>> = {
  facebook: 'facebook',
  instagram: 'instagram',
}

/**
 * Deletes what a provider's sync created: the imported documents, and the
 * media assets placed on them, through the media manager so the R2 objects and
 * Cloudflare Images go too.
 */
async function eraseImportedContent(
  env: CloudflareEnv,
  organizationId: string,
  channel: string,
  actorUserId: string | null,
  warnings: string[],
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

  // Documents first: the placements are theirs and go with them, so an asset
  // delete that fails cannot leave a post pointing at an image that is gone.
  await execute(env.DB, `DELETE FROM content_documents WHERE organization_id = ? AND id IN (${placeholders})`,
    [organizationId, ...ids])

  for (const { asset_id: assetId } of assets) {
    try {
      await deleteMediaAsset(env.DB, env, assetId, organizationId, actorUserId)
    } catch (error) {
      warnings.push(`media asset ${assetId} could not be deleted`)
      console.error('integration_release_media_delete_failed', {
        assetId, error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return documents.length
}

/** Revokes the provider-side authorization a product holds on its own. */
async function revokeProviderAuthorization(
  env: CloudflareEnv,
  organizationId: string,
  product: IntegrationProduct,
  warnings: string[],
): Promise<void> {
  try {
    if (product === 'facebook') {
      const connection = await getFacebookPagesConnection(env, organizationId)
      if (connection?.facebook_user_id) {
        await revokeFacebookAuthorization(connection.facebook_user_id, connection.encrypted_user_token)
      }
      return
    }
    if (product === 'instagram') {
      const connection = await readInstagramConnection(env, organizationId)
      if (connection?.instagram_user_id) {
        await revokeInstagramAuthorization(connection.instagram_user_id, connection.encrypted_access_token)
      }
    }
    // The Google products hold no token of their own. The shared credential is
    // revoked by releaseGoogleCredential once neither of them remains.
  } catch (error) {
    // A provider that refuses the revoke — an already-invalidated token, an
    // account the person revoked from their own settings — must not leave the
    // tenant unable to disconnect.
    warnings.push(`${product} authorization could not be revoked at the provider`)
    console.error('integration_release_revoke_failed', {
      product, error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function releaseIntegration(
  env: CloudflareEnv,
  organizationId: string,
  product: IntegrationProduct,
  options: ReleaseIntegrationOptions = {},
): Promise<ReleaseIntegrationResult> {
  const warnings: string[] = []
  const key = PRODUCT_KEY[product]

  const present = await queryFirst<{ connected: number }>(env.DB, `
    SELECT json_extract(integrations_json, ?) IS NOT NULL AS connected
      FROM organization WHERE id = ? LIMIT 1
  `, [`$.${key}`, organizationId])
  const released = Boolean(present?.connected)

  // Revoke before the record goes: the token lives in the row being removed.
  if (released) await revokeProviderAuthorization(env, organizationId, product, warnings)

  let erasedDocuments = 0
  const channel = PRODUCT_CHANNEL[product]
  if (options.eraseProviderData && channel) {
    erasedDocuments = await eraseImportedContent(env, organizationId, channel, options.actorUserId ?? null, warnings)
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

  // Both Google products go through this; it drops and revokes the shared
  // credential only once neither is connected, which is what keeps one
  // disconnect from taking the other's account away.
  if (product === 'google-analytics' || product === 'google-search-console') {
    const warning = await releaseGoogleCredential(env, organizationId)
    if (warning) warnings.push(warning)
  }

  // Zaraz serves the measurement id of connected sites, so losing Analytics
  // has to withdraw the tag rather than keep collecting for a tenant who
  // disconnected.
  if (product === 'google-analytics' && released) {
    try {
      await reconcileZarazAnalytics(env, env.DB)
    } catch (error) {
      warnings.push('analytics tag could not be reconciled')
      console.error('integration_release_zaraz_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { product, released, erasedDocuments, warnings }
}

/**
 * Releases every product a tenant has — for tenant deletion, and for a
 * wholesale erase.
 *
 * Tenant deletion calls this before the rows go, because a credential named
 * only by a row that no longer exists can never be revoked afterwards — the
 * same reason Cloudflare hostnames and Images are released first.
 */
export async function releaseOrganizationIntegrations(
  env: CloudflareEnv,
  organizationId: string,
  options: ReleaseIntegrationOptions = {},
): Promise<ReleaseIntegrationResult[]> {
  // A product that will not release stops the deletion: the rows are what name
  // the credential, so deleting them first would leave it unrevokable. The
  // deletion sweep retries, and its failure is the cron run's.
  const results: ReleaseIntegrationResult[] = []
  for (const product of INTEGRATION_PRODUCTS) {
    results.push(await releaseIntegration(env, organizationId, product, options))
  }
  return results
}

/**
 * Releases the Meta products a Meta user id is connected through, wherever
 * they are. Meta's deauthorize and data-deletion callbacks name a person, not
 * a site, so this is how those callbacks reach the right rows.
 */
export async function releaseMetaUserIntegrations(
  env: CloudflareEnv,
  metaUserId: string,
  options: ReleaseIntegrationOptions = {},
): Promise<ReleaseIntegrationResult[]> {
  const rows = await queryAll<{ organization_id: string; product: string }>(env.DB, `
    SELECT id AS organization_id, 'facebook' AS product FROM organization
     WHERE json_extract(integrations_json, '$.facebook.facebook_user_id') = ?
    UNION ALL
    SELECT id AS organization_id, 'instagram' AS product FROM organization
     WHERE json_extract(integrations_json, '$.instagram.instagram_user_id') = ?
  `, [metaUserId, metaUserId])

  const results: ReleaseIntegrationResult[] = []
  for (const row of rows) {
    if (!isIntegrationProduct(row.product)) continue
    results.push(await releaseIntegration(env, row.organization_id, row.product, options))
  }
  return results
}
