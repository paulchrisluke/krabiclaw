import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import type { CloudflareEnv } from '~/server/utils/auth'
import { deleteImage } from '~/server/utils/cloudflare-images'
import { deleteOrganizationCustomDomains } from '~/server/utils/domains'
import { releaseOrganizationIntegrations } from '~/server/utils/integration-release'
import { organizationAdapter, resolveOrganizationMembership } from '~/server/utils/member-access'

/**
 * Cloudflare Images this organization is the last holder of. An image id shared
 * with another organization (an import can reuse one) stays.
 */
async function ownedImageIds(db: DbClient, organizationId: string): Promise<string[]> {
  const owned = await queryAll<{ cloudflare_image_id: string }>(db, `
    SELECT DISTINCT cloudflare_image_id FROM media_assets
    WHERE organization_id = ? AND cloudflare_image_id IS NOT NULL
  `, [organizationId])
  const imageIds = (owned || []).map(row => row.cloudflare_image_id)
  if (imageIds.length === 0) return []

  const shared = await queryAll<{ cloudflare_image_id: string }>(db, `
    SELECT DISTINCT cloudflare_image_id FROM media_assets
    WHERE organization_id <> ?
      AND cloudflare_image_id IN (SELECT value FROM json_each(?))
  `, [organizationId, d1JsonStringSet(imageIds)])
  const sharedIds = new Set((shared || []).map(row => row.cloudflare_image_id))
  return imageIds.filter(imageId => !sharedIds.has(imageId))
}

/**
 * KrabiClaw-specific cleanup Better Auth cannot perform.
 *
 * The Better Auth organization lifecycle owns authorization, subscription
 * gating and the organization/member deletion itself. This function only
 * releases external resources and D1 guest records that intentionally restrict
 * the organization delete. Any failure propagates and aborts the Better Auth
 * deletion.
 */
export async function cleanupOrganizationBeforeDelete(
  env: CloudflareEnv,
  organizationId: string,
): Promise<void> {
  const db = env.DB
  await deleteOrganizationCustomDomains(env, db, organizationId)
  await releaseOrganizationIntegrations(env, organizationId)

  for (const imageId of await ownedImageIds(db, organizationId)) {
    await deleteImage(env, imageId)
  }

  await executeBatch(db, [
    { query: 'DELETE FROM bookings WHERE organization_id = ?', params: [organizationId] },
    { query: 'DELETE FROM reservations WHERE organization_id = ?', params: [organizationId] },
  ], { operation: 'Release organization guest records' })
}

/**
 * What the draft claimed, and therefore what abandoning it has to give back:
 * `nothing` when the draft never got as far as creating either.
 */
export type AbandonedDraftTenantOutcome =
  | { removed: 'organization' | 'nothing' }
  | { refused: 'organization_is_live' | 'not_owner' | 'delete_incomplete' }

/**
 * Abandoning an onboarding draft is an internal token-scoped cleanup rather
 * than the signed-in organization-delete product action. It still reuses the
 * same KrabiClaw resource cleanup before removing the Better Auth organization.
 */
export async function deleteAbandonedDraftTenant(
  env: CloudflareEnv,
  claim: { organizationId: string; subdomain: string; userId: string },
): Promise<AbandonedDraftTenantOutcome> {
  const db = env.DB
  const { organizationId, subdomain, userId } = claim

  const membership = await resolveOrganizationMembership(env, { organizationId, userId })
  if (membership?.role !== 'owner') return { refused: 'not_owner' }

  const draft = await queryFirst<{ id: string; onboarding_status: string }>(db, `
    SELECT id, onboarding_status FROM organization WHERE id = ? AND subdomain = ? LIMIT 1
  `, [organizationId, subdomain])
  if (!draft) return { removed: 'nothing' }
  if (draft.onboarding_status === 'active') return { refused: 'organization_is_live' }

  await cleanupOrganizationBeforeDelete(env, organizationId)
  const adapter = await organizationAdapter(env)
  await adapter.deleteOrganization(organizationId)

  const survivor = await queryFirst<{ id: string }>(db, 'SELECT id FROM organization WHERE id = ? LIMIT 1', [organizationId])
  if (survivor) {
    console.error('tenant_deletion_draft_cascade_incomplete', { organizationId })
    return { refused: 'delete_incomplete' }
  }
  return { removed: 'organization' }
}
