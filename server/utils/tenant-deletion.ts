import { executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { readOrganizationSubscriptions } from '~/server/utils/billing-access'
import { deleteImage } from '~/server/utils/cloudflare-images'
import { deleteOrganizationCustomDomains } from '~/server/utils/domains'
import { releaseOrganizationIntegrations } from '~/server/utils/integration-release'
import { listOrganizationMembers, listUserOrganizations, organizationAdapter, resolveOrganizationMembership } from '~/server/utils/member-access'
import { createStripeClient } from '~/server/utils/stripe-client'

export interface AccountDeletionPlan {
  deleteOrganizationIds: string[]
  blockedOrganizationIds: string[]
}

export async function planAccountDeletion(env: CloudflareEnv, userId: string): Promise<AccountDeletionPlan> {
  const plan: AccountDeletionPlan = { deleteOrganizationIds: [], blockedOrganizationIds: [] }
  for (const organization of await listUserOrganizations(env, userId)) {
    const membership = await resolveOrganizationMembership(env, { organizationId: organization.id, userId })
    if (membership?.role !== 'owner') continue
    const members = await listOrganizationMembers(env, organization.id)
    if (members.some(member => member.role === 'owner' && member.userId !== userId)) continue
    if (members.some(member => member.userId !== userId)) plan.blockedOrganizationIds.push(organization.id)
    else plan.deleteOrganizationIds.push(organization.id)
  }
  return plan
}

async function cancelOrganizationSubscriptions(env: CloudflareEnv, organizationId: string): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required')
  const rows = (await readOrganizationSubscriptions(env, [organizationId])).get(organizationId) ?? []
  const stripe = createStripeClient(env.STRIPE_SECRET_KEY)
  for (const row of rows) {
    if ((row.status !== 'active' && row.status !== 'trialing') || !row.stripeSubscriptionId) continue
    await stripe.subscriptions.cancel(row.stripeSubscriptionId)
  }
}

/**
 * Cloudflare Images the organization is the last holder of. An image id shared
 * with another organization (an import can reuse one) stays.
 */
/**
 * Cloudflare Images the organization is the last holder of. An image id shared
 * with another organization (an import can reuse one) stays.
 */
async function ownedImageIds(
  db: DbClient,
  scope: { column: 'organization_id' | 'organization_id'; value: string },
): Promise<string[]> {
  const owned = await queryAll<{ cloudflare_image_id: string }>(db, `
    SELECT DISTINCT cloudflare_image_id FROM media_assets
    WHERE ${scope.column} = ? AND cloudflare_image_id IS NOT NULL
  `, [scope.value])
  const imageIds = (owned || []).map(row => row.cloudflare_image_id)
  if (imageIds.length === 0) return []

  const shared = await queryAll<{ cloudflare_image_id: string }>(db, `
    SELECT DISTINCT cloudflare_image_id FROM media_assets
    WHERE ${scope.column} <> ?
      AND cloudflare_image_id IN (SELECT value FROM json_each(?))
  `, [scope.value, d1JsonStringSet(imageIds)])
  const sharedIds = new Set((shared || []).map(row => row.cloudflare_image_id))
  return imageIds.filter(imageId => !sharedIds.has(imageId))
}

/**
 * Delete an organization now: release what lives outside D1 first, then let
 * Better Auth delete the organization and the cascade do the rest.
 *
 * Cloudflare failures are logged and skipped rather than aborting: the domain
 * path already queues its own reconciliation retry, and an image that outlives
 * its rows must not keep a customer's data alive in D1.
 */
export async function deleteOrganizationNow(env: CloudflareEnv, organizationId: string): Promise<void> {
  const db = env.DB
  await cancelOrganizationSubscriptions(env, organizationId)
  await deleteOrganizationCustomDomains(env, db, organizationId)
  await releaseOrganizationIntegrations(env, organizationId)

  for (const imageId of await ownedImageIds(db, { column: 'organization_id', value: organizationId })) {
    await deleteImage(env, imageId)
  }

  // What the organization's guests hold goes with it, stated rather than left
  // to cascade order: a booking pins its session and its variant (both foreign
  // keys RESTRICT), so a tenant that still has one cannot be deleted until
  // this says it may be.
  await executeBatch(db, [
    { query: 'DELETE FROM bookings WHERE organization_id = ?', params: [organizationId] },
    { query: 'DELETE FROM reservations WHERE organization_id = ?', params: [organizationId] },
  ], { operation: 'Release organization guest records' })

  const adapter = await organizationAdapter(env)
  await adapter.deleteOrganization(organizationId)
}

/**
 * Delete an account immediately after the caller has explicitly confirmed it.
 * Shared organizations survive. A sole-owned organization with other members
 * blocks deletion rather than choosing a successor.
 */
export async function deleteAccountNow(env: CloudflareEnv, userId: string): Promise<void> {
  const plan = await planAccountDeletion(env, userId)
  if (plan.blockedOrganizationIds.length) {
    const error = new Error('Transfer ownership of organizations with other members before deleting your account.')
    ;(error as Error & { code?: string; organizationIds?: string[] }).code = 'sole_owner_with_members'
    ;(error as Error & { code?: string; organizationIds?: string[] }).organizationIds = plan.blockedOrganizationIds
    throw error
  }
  for (const organizationId of plan.deleteOrganizationIds) await deleteOrganizationNow(env, organizationId)
  const context = await createAuth(env).$context
  await context.internalAdapter.deleteUser(userId)
  await context.internalAdapter.deleteUserSessions(userId)
}

/**
 * What the draft claimed, and therefore what abandoning it has to give back:
 * `nothing` when the draft never got as far as creating either.
 */
export type AbandonedDraftTenantOutcome =
  | { removed: 'organization' | 'nothing' }
  | { refused: 'organization_is_live' | 'not_owner' | 'delete_incomplete' }

/**
 * Abandoning a wizard draft: delete the pending organization it created, now.
 *
 * There is no grace period because nothing was ever public — onboarding has not
 * finished, so tenant resolution has only ever served it to the holder of its
 * preview token. Deleting it immediately also gives the owner their address
 * back straight away, which matters when they abandoned the draft precisely
 * because they typed the wrong business name.
 *
 * The draft's claim is (organization, subdomain), so this resolves the row from
 * that pair rather than from an id the caller looked up with a narrower filter
 * of its own: an organization that is no longer pending has to come back as
 * `organization_is_live`, and the caller cannot report that if its own lookup
 * silently found nothing.
 *
 * Re-reads the row after deleting it: a delete or a cascade that left it
 * standing must not come back as success.
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
  // Only an activated organization is live. One whose onboarding failed is not,
  // and refusing it as live told the owner their site was published while its
  // tile read "Setup incomplete" — and left them no way to release the address.
  if (draft.onboarding_status === 'active') return { refused: 'organization_is_live' }

  await deleteOrganizationNow(env, organizationId)
  // Read the row back rather than counting changes: a cascade makes
  // meta.changes the number of rows the whole tree lost (15 for a seeded
  // onboarding organization), so it says nothing about this one row.
  const survivor = await queryFirst<{ id: string }>(db, 'SELECT id FROM organization WHERE id = ? LIMIT 1', [organizationId])
  if (survivor) {
    console.error('tenant_deletion_draft_cascade_incomplete', { organizationId, })
    return { refused: 'delete_incomplete' }
  }
  return { removed: 'organization' }
}

