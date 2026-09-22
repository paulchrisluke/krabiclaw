import { getGuestRequest } from '~/server/domain/requests'
import type { DbClient } from '~/server/db'
import { HTTPError, type H3Event } from 'nitro'
import { getGuestThreadDetail } from '~/server/domain/guest-threads/detail'
import {
  getGuestThreadOperationSummary,
  listGuestThreads,
  listOrganizationGuestThreads,
} from '~/server/domain/guest-threads/repository'
import type {
  ConversationState,
  GuestThreadSubmissionType,
} from '~/server/domain/guest-threads/types'
import { requireOrganizationAccess } from '~/server/utils/location-access'
import { assertMemberScope, isOrganizationWideRole, listUserOrganizationTeamIds, memberAccessPrincipal, assertRoleAllows } from '~/server/utils/member-access'
import { publishNotificationInvalidation } from '~/server/cloudflare/guest-inbox-events'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { acknowledgeThreadNotifications } from '~/server/utils/notification-acknowledgement'
import { getNotificationAccess } from '~/server/utils/notification-access'

export interface DashboardGuestThreadListQuery {
  locationId?: string | null
  type?: GuestThreadSubmissionType | null
  conversationState?: ConversationState | null
  unreadOnly?: boolean
  occurrence?: 'upcoming' | 'past' | null
}

export interface OrganizationGuestThreadListQuery extends DashboardGuestThreadListQuery {
  organizationId?: string | null
}

/**
 * The thread list for a caller whose access is already resolved.
 *
 * `loadDashboardGuestThreads` below is this with the resolution in front of it,
 * for a request that arrives with nothing. A caller that has already resolved
 * the principal and asserted the same scope — the location overview does both —
 * uses this instead of handing over its event and paying for the whole chain a
 * second time.
 */
export async function listDashboardGuestThreadsForPrincipal(
  db: DbClient,
  organizationId: string,
  input: { principal: MemberAccessPrincipal; userId: string; query: DashboardGuestThreadListQuery },
) {
  const { principal, userId, query } = input
  const options = {
    locationId: query.locationId ?? null,
    principal,
    userId,
    type: query.type ?? null,
    conversationState: query.conversationState ?? null,
    occurrence: query.occurrence ?? null,
    unreadOnly: query.unreadOnly ?? false,
  }
  const [threads, summary] = await Promise.all([
    listGuestThreads(db, organizationId, options),
    getGuestThreadOperationSummary(db, organizationId, options),
  ])
  return { threads, summary }
}

export async function loadDashboardGuestThreads(
  event: H3Event,
  organizationId: string,
  query: DashboardGuestThreadListQuery,
) {
  const { env, db, session, organization } = await requireOrganizationAccess(event, organizationId, 'context')
  const principal = memberAccessPrincipal(organization.membership, { env, organizationId, event })
  if (query.locationId) {
    await assertMemberScope(db, { ...principal, locationId: query.locationId })
  }
  return listDashboardGuestThreadsForPrincipal(db, organizationId, { principal, userId: session.user.id, query })
}

export async function loadDashboardGuestThread(
  event: H3Event,
  organizationId: string,
  threadId: string,
) {
  const { db, env, organization } = await requireOrganizationAccess(event, organizationId, 'context')
  const thread = await getGuestRequest(db, threadId, organizationId)
  if (!thread) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Thread not found' })
  }
  await assertMemberScope(db, { ...memberAccessPrincipal(organization.membership, { env, organizationId, event }), locationId: thread.location_id })

  const detail = await getGuestThreadDetail(db, threadId, organizationId)
  if (!detail) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Thread not found' })
  }

  const notificationAccess = await getNotificationAccess(event)
  const acknowledged = await acknowledgeThreadNotifications(db, notificationAccess, threadId)
  if (acknowledged > 0) {
    await publishNotificationInvalidation(env, {
      type: 'notification.read',
      organizationId: thread.organization_id,
      locationId: thread.location_id,
      targetUserId: notificationAccess.userId,
    })
  }
  return { thread: detail }
}

export async function loadOrganizationGuestThreads(
  event: H3Event,
  query: OrganizationGuestThreadListQuery,
  scope?: { orgSlug?: string | null },
) {
  const { db, env, organization, userId } = await getDashboardContext(event, {
    requireOrganization: true,
    requireSite: false,
    organizationSlug: scope?.orgSlug,
  })
  if (!organization) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  }
  // The rows are filtered by team below, so this only asks whether the role
  // takes part in guest operations at all.
  await assertRoleAllows({ organizationId: organization.id, role: organization.role, permissions: { operations: ['read'] } })

  const principal = {
    userId,
    role: organization.role,
    organizationId: organization.id,
    teamIds: isOrganizationWideRole(organization.role)
      ? null
      : await listUserOrganizationTeamIds({ env, organizationId: organization.id, userId, event }),
  }
  const options = {
    organizationId: organization.id,
    locationId: query.locationId ?? null,
    principal,
    userId,
    type: query.type ?? null,
    conversationState: query.conversationState ?? null,
    occurrence: query.occurrence ?? null,
    unreadOnly: query.unreadOnly ?? false,
  }
  const [threads, summary] = await Promise.all([
    listOrganizationGuestThreads(db, options),
    getGuestThreadOperationSummary(db, options.organizationId, options),
  ])
  return { threads, summary }
}
