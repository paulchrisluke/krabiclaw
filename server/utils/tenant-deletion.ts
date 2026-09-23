// The one way a tenant leaves KrabiClaw.
//
// Deletion is scheduled, not immediate: an owner asks for it, the organization
// (or account) carries a deletionScheduledAt instant, and the deletion-sweep
// task performs the deletion once the grace period has passed. Until then the
// sites keep serving and the request can be cancelled, so a misclick is not a
// dead business.
//
// Better Auth owns the delete itself. deleteOrganization goes through its
// organization adapter (members, invitations, then the organization row) and
// the database's ON DELETE CASCADE takes the sites, domains, locations,
// content and media rows with it — verified against D1, which enforces
// foreign keys on every statement. deleteAccount goes through Better Auth's
// internal adapter, the same call its own /delete-user route makes.
//
// Only the resources that live outside D1 need explicit release, and they have
// to be released *before* the rows that name them are gone: Cloudflare custom
// hostnames and Cloudflare Images. Everything else is the cascade's job.
//
// The organization plugin's own /organization/delete route is disabled
// (disableOrganizationDeletion in server/utils/auth.ts) so this module is the
// only path — a raw call to that route would skip the grace period and leak
// every external resource above.

import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { FREE_PLAN, getOrganizationPlans } from '~/server/utils/billing-access'
import { deleteImage } from '~/server/utils/cloudflare-images'
import { deleteOrganizationCustomDomains } from '~/server/utils/domains'
import { listOrganizationMembers, listUserOrganizations, organizationAdapter, resolveOrganizationMembership, type OrganizationAdapter } from '~/server/utils/member-access'

/** How long an owner has to change their mind. */
export const DELETION_GRACE_DAYS = 30

export function deletionDueAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
}

export interface ScheduledDeletion {
  scheduledAt: Date
  organizationIds: string[]
}

/**
 * Organizations the user owns alone. Deleting the account deletes these with
 * it; organizations with another owner simply lose a member.
 */
export async function listSoleOwnedOrganizationIds(env: CloudflareEnv, userId: string): Promise<string[]> {
  const organizations = await listUserOrganizations(env, userId)
  const soleOwned: string[] = []
  for (const organization of organizations) {
    const membership = await resolveOrganizationMembership(env, { organizationId: organization.id, userId })
    if (membership?.role !== 'owner') continue
    const members = await listOrganizationMembers(env, organization.id)
    if (members.filter(member => member.role === 'owner').length === 1) soleOwned.push(organization.id)
  }
  return soleOwned
}

/**
 * A paid plan has to be cancelled first: deleting the organization would leave
 * the Stripe subscription charging a customer with nothing to show for it.
 */
export async function findPaidOrganization(
  env: CloudflareEnv,
  organizationIds: string[],
  now: Date,
): Promise<string | null> {
  if (organizationIds.length === 0) return null
  for (const [organizationId, plan] of await getOrganizationPlans(env, organizationIds, now)) {
    if (plan !== FREE_PLAN) return organizationId
  }
  return null
}

async function setOrganizationDeletionScheduledAt(
  env: CloudflareEnv,
  organizationId: string,
  scheduledAt: Date | null,
): Promise<void> {
  const adapter = await organizationAdapter(env)
  // deletionScheduledAt is declared input: false so no Better Auth request body
  // can set it — which also keeps it out of the adapter's *write* type, while
  // the adapter still persists whatever it is given. This is the one place
  // allowed to write it.
  await adapter.updateOrganization(
    organizationId,
    { deletionScheduledAt: scheduledAt } as unknown as Parameters<OrganizationAdapter['updateOrganization']>[1],
  )
}

async function setUserDeletionScheduledAt(
  env: CloudflareEnv,
  userId: string,
  scheduledAt: Date | null,
): Promise<void> {
  const context = await createAuth(env).$context
  await context.internalAdapter.updateUser(userId, { deletionScheduledAt: scheduledAt })
}

/** Schedule one organization (and its sites) for deletion. */
export async function scheduleOrganizationDeletion(
  env: CloudflareEnv,
  organizationId: string,
  requestedAt = new Date(),
): Promise<ScheduledDeletion> {
  const scheduledAt = deletionDueAt(requestedAt)
  await setOrganizationDeletionScheduledAt(env, organizationId, scheduledAt)
  return { scheduledAt, organizationIds: [organizationId] }
}

export async function cancelOrganizationDeletion(env: CloudflareEnv, organizationId: string): Promise<void> {
  await setOrganizationDeletionScheduledAt(env, organizationId, null)
}

/**
 * Schedule the account. The organizations the user owns alone are scheduled
 * with it, so every dashboard those sites appear in shows the same pending
 * deletion instead of a site that silently disappears on sweep day.
 */
export async function scheduleAccountDeletion(
  env: CloudflareEnv,
  userId: string,
  // The caller has already resolved and checked these; scheduling the same
  // rows it checked is what keeps the two from disagreeing.
  organizationIds: string[],
  requestedAt = new Date(),
): Promise<ScheduledDeletion> {
  const scheduledAt = deletionDueAt(requestedAt)
  for (const organizationId of organizationIds) {
    await setOrganizationDeletionScheduledAt(env, organizationId, scheduledAt)
  }
  await setUserDeletionScheduledAt(env, userId, scheduledAt)
  return { scheduledAt, organizationIds }
}

/**
 * Clear what is actually scheduled.
 *
 * Not a fresh computation of which organizations the user owns alone: during a
 * thirty-day grace period a second owner can be added, and recomputing then
 * left the organization scheduled for deletion with nothing able to cancel it.
 * The scheduled instant on the organization is the record, so it is the thing
 * read.
 */
export async function cancelAccountDeletion(env: CloudflareEnv, userId: string): Promise<void> {
  for (const organization of await listUserOrganizations(env, userId)) {
    if (!organization.deletionScheduledAt) continue
    await setOrganizationDeletionScheduledAt(env, organization.id, null)
  }
  await setUserDeletionScheduledAt(env, userId, null)
}

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
  await deleteOrganizationCustomDomains(env, db, organizationId)

  for (const imageId of await ownedImageIds(db, { column: 'organization_id', value: organizationId })) {
    await deleteImage(env, imageId).catch((error: unknown) => {
      console.error('tenant_deletion_image_release_failed', {
        organizationId,
        imageId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
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
 * Delete an account now: its sole-owned organizations first (so no site is
 * left with nobody who can administer it), then the user through Better Auth's
 * internal adapter — the same pair of calls its own /delete-user route makes.
 */
export async function deleteAccountNow(env: CloudflareEnv, userId: string): Promise<void> {
  for (const organizationId of await listSoleOwnedOrganizationIds(env, userId)) {
    await deleteOrganizationNow(env, organizationId)
  }
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

export interface DeletionSweepResult {
  organizations: number
  users: number
  skipped: string[]
}

interface DueRow { id: string }

/**
 * Rows whose grace period has passed. `user` and `organization` are Better
 * Auth-owned tables, so this reads them through Better Auth's own database
 * adapter rather than SQL of our own.
 */
async function findDueRows(env: CloudflareEnv, model: 'user' | 'organization', now: Date): Promise<DueRow[]> {
  const context = await createAuth(env).$context
  return await context.adapter.findMany<DueRow>({
    model,
    where: [{ field: 'deletionScheduledAt', operator: 'lte', value: now }],
    sortBy: { field: 'deletionScheduledAt', direction: 'asc' },
  })
}

/**
 * Perform every deletion whose grace period has passed. Accounts run first so
 * their organizations are removed by the account path rather than twice.
 */
export async function sweepScheduledDeletions(env: CloudflareEnv, now = new Date()): Promise<DeletionSweepResult> {
  const result: DeletionSweepResult = { organizations: 0, users: 0, skipped: [] }

  for (const user of await findDueRows(env, 'user', now)) {
    const paid = await findPaidOrganization(env, await listSoleOwnedOrganizationIds(env, user.id), now)
    if (paid) {
      result.skipped.push(`user:${user.id}:paid_plan`)
      continue
    }
    await deleteAccountNow(env, user.id)
    result.users += 1
  }

  for (const organization of await findDueRows(env, 'organization', now)) {
    const paid = await findPaidOrganization(env, [organization.id], now)
    if (paid) {
      result.skipped.push(`organization:${organization.id}:paid_plan`)
      continue
    }
    await deleteOrganizationNow(env, organization.id)
    result.organizations += 1
  }

  return result
}
