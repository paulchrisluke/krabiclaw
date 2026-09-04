import { HTTPError, type H3Event } from 'nitro'
import { getGuestThreadDetail } from '~/server/domain/guest-threads/detail'
import {
  getGuestThreadById,
  getGuestThreadOperationSummary,
  listGuestThreads,
  listOrganizationGuestThreads,
} from '~/server/domain/guest-threads/repository'
import type {
  ConversationState,
  GuestThreadSubmissionType,
} from '~/server/domain/guest-threads/types'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope, isOrganizationWideRole, listUserOrganizationTeamIds } from '~/server/utils/member-access'
import { publishNotificationInvalidation } from '~/server/cloudflare/guest-inbox-events'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { acknowledgeThreadNotifications } from '~/server/utils/notification-acknowledgement'
import { getNotificationAccess } from '~/server/utils/notification-access'

export interface DashboardGuestThreadListQuery {
  locationId?: string | null
  search?: string | null
  type?: GuestThreadSubmissionType | null
  conversationState?: ConversationState | null
  unreadOnly?: boolean
}

export interface OrganizationGuestThreadListQuery extends DashboardGuestThreadListQuery {
  siteId?: string | null
}

export async function loadDashboardGuestThreads(
  event: H3Event,
  siteId: string,
  query: DashboardGuestThreadListQuery,
) {
  const { env, db, session, site } = await requireSiteAccess(event, siteId, 'context')
  if (query.locationId) {
    await assertMemberScope(db, {
      env,
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      locationId: query.locationId,
    })
  }
  const principal = {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  }
  const options = {
    locationId: query.locationId ?? null,
    principal,
    userId: session.user.id,
    search: query.search ?? null,
    type: query.type ?? null,
    conversationState: query.conversationState ?? null,
    unreadOnly: query.unreadOnly ?? false,
  }
  const [threads, summary] = await Promise.all([
    listGuestThreads(db, siteId, options),
    getGuestThreadOperationSummary(db, siteId, options),
  ])
  return { threads, summary }
}

export async function loadDashboardGuestThread(
  event: H3Event,
  siteId: string,
  threadId: string,
) {
  const { db, env, site } = await requireSiteAccess(event, siteId, 'context')
  const thread = await getGuestThreadById(db, threadId, siteId)
  if (!thread) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Thread not found' })
  }
  await assertMemberScope(db, {
    env,
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    locationId: thread.location_id,
  })

  const detail = await getGuestThreadDetail(db, threadId, siteId)
  if (!detail) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Thread not found' })
  }

  const notificationAccess = await getNotificationAccess(event)
  const acknowledged = await acknowledgeThreadNotifications(db, notificationAccess, threadId)
  if (acknowledged > 0) {
    await publishNotificationInvalidation(env, {
      type: 'notification.read',
      organizationId: thread.organization_id,
      siteId: thread.site_id,
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
    organizationSlug: scope?.orgSlug,
    pathname: '/api/dashboard/guest-threads',
  })
  if (!organization) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  }

  const principal = {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
    teamIds: isOrganizationWideRole(organization.role)
      ? null
      : await listUserOrganizationTeamIds({ env, organizationId: organization.id, userId }),
  }
  const options = {
    organizationId: organization.id,
    siteId: query.siteId ?? null,
    locationId: query.locationId ?? null,
    principal,
    userId,
    search: query.search ?? null,
    type: query.type ?? null,
    conversationState: query.conversationState ?? null,
    unreadOnly: query.unreadOnly ?? false,
  }
  const [threads, summary] = await Promise.all([
    listOrganizationGuestThreads(db, options),
    getGuestThreadOperationSummary(db, options.siteId, options),
  ])
  return { threads, summary }
}
