import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { getGuestThreadDetail } from '~/server/domain/guest-threads/detail'
import {
  getGuestThreadById,
  getGuestThreadOperationSummary,
  listGuestThreads,
  listOrganizationGuestThreads,
} from '~/server/domain/guest-threads/repository'
import { advanceMemberCursor } from '~/server/domain/guest-threads/read-state'
import type {
  ConversationState,
  GuestThreadSubmissionType,
} from '~/server/domain/guest-threads/types'
import { requireSiteAccess } from '~/server/utils/location-access'
import { assertMemberScope } from '~/server/utils/member-access'
import { publishGuestInboxThreadEvent } from '~/server/cloudflare/guest-inbox-events'
import { getDashboardContext } from '~/server/utils/dashboard-context'

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
  const { db, site } = await requireSiteAccess(event, siteId, 'context')
  if (query.locationId) {
    await assertMemberScope(db, {
      memberId: site.member_id,
      role: site.member_role,
      organizationId: site.organization_id,
      siteId,
      locationId: query.locationId,
    })
  }
  const principal = {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  }
  const options = {
    locationId: query.locationId ?? null,
    principal,
    memberId: site.member_id,
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
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
    locationId: thread.location_id,
  })

  const detail = await getGuestThreadDetail(db, threadId, siteId, site.member_id)
  if (!detail) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Thread not found' })
  }

  try {
    const latest = detail.entries[detail.entries.length - 1]
    if (latest) {
      const advanced = await advanceMemberCursor(db, threadId, site.member_id, latest.id)
      if (advanced) {
        await publishGuestInboxThreadEvent(env, db, { threadId, type: 'read-state.changed' })
      }
    }
  } catch (error) {
    console.error('advance_member_cursor_failed', {
      threadId,
      memberId: site.member_id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return { thread: detail }
}

export async function loadOrganizationGuestThreads(
  event: H3Event,
  query: OrganizationGuestThreadListQuery,
) {
  const { db, organization } = await getDashboardContext(event, { requireOrganization: true })
  if (!organization) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Organization not found' })
  }

  const principal = {
    memberId: organization.memberId,
    role: organization.role,
    organizationId: organization.id,
  }
  const options = {
    organizationId: organization.id,
    siteId: query.siteId ?? null,
    locationId: query.locationId ?? null,
    principal,
    memberId: organization.memberId,
    search: query.search ?? null,
    type: query.type ?? null,
    conversationState: query.conversationState ?? null,
    unreadOnly: query.unreadOnly ?? false,
  }
  const [threads, summary] = await Promise.all([
    listOrganizationGuestThreads(db, options),
    getGuestThreadOperationSummary(db, null, options),
  ])
  return { threads, summary }
}
