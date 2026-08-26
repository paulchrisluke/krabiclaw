import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { deleteOrganization, listOrganizationMembers, listUserOrganizations, resolveOrganizationMembership } from '~/server/utils/member-access'

const ACTIVE_STATUSES = ['active', 'trialing', 'past_due']

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  const userId = session.user.id

  const organizations = await listUserOrganizations(env, userId)
  const organizationDetails = await Promise.all(organizations.map(async (organization) => ({
    organization,
    membership: await resolveOrganizationMembership(env, { organizationId: organization.id, userId }),
    members: await listOrganizationMembers(env, organization.id),
  })))
  const allOrgIds = organizations.map(organization => organization.id)
  const soleOwnedOrgIds = organizationDetails.flatMap(({ organization, membership, members }) =>
    membership?.role === 'owner' && members.filter(member => member.role === 'owner').length === 1
      ? [organization.id]
      : [])

  // Single query: block deletion if any org has an active subscription
  if (allOrgIds.length > 0) {
    const placeholders = allOrgIds.map(() => '?').join(', ')
    const statusPlaceholders = ACTIVE_STATUSES.map(() => '?').join(', ')
    const activeSubscription = await queryFirst(db, `
      SELECT organization_id FROM organization_billing
      WHERE organization_id IN (${placeholders})
      AND status IN (${statusPlaceholders})
      LIMIT 1
    `, [...allOrgIds, ...ACTIVE_STATUSES])

    if (activeSubscription) {
      return jsonResponse(
        { error: 'active_subscription', message: 'Please cancel your subscription before deleting your account.' }, { status: 409 }
      )
    }
  }

  // For each sole-owned org, block if other members exist (would lose access)
  for (const orgId of soleOwnedOrgIds) {
    const details = organizationDetails.find(({ organization }) => organization.id === orgId)
    if (details?.members.some(member => member.userId !== userId)) {
      return jsonResponse(
        { error: 'org_has_members', message: 'Transfer ownership or remove all members before deleting your account.' }, { status: 409 }
      )
    }
  }

  // Attribution is user-linked data even though the client ID is stored on
  // the organization billing projection. Erase both fields for organizations
  // the user leaves; the FK only protects ga_user_id and would otherwise leave
  // the client identifier behind on co-owned organizations.
  await execute(db, `
    UPDATE organization_billing
    SET ga_client_id = NULL, ga_user_id = NULL, updated_at = ?
    WHERE ga_user_id = ?
  `, [new Date().toISOString(), userId])

  const auth = createAuth(env)
  const response = await (auth.api as unknown as {
    deleteUser(_input: { body: Record<string, never>; headers: HeadersInit; asResponse: true }): Promise<Response>
  }).deleteUser({
    body: {},
    headers: Object.fromEntries(event.req.headers.entries()) as HeadersInit,
    asResponse: true,
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    return jsonResponse({ error: 'account_deletion_failed', message: message || 'Failed to delete account.' }, { status: response.status })
  }

  for (const organizationId of soleOwnedOrgIds) {
    await deleteOrganization(env, organizationId)
  }

  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
