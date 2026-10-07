import type { CloudflareEnv } from '~/server/utils/auth'
import { organizationAdapter } from '~/server/utils/member-access'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'
import { createDb, queryAll, type DbClient } from '~/server/db'
import type { GuestThreadDeliveryRow } from '~/server/domain/guest-threads/types'

export interface DashboardMemberRow {
  id: string
  role: string
  createdAt: string
  userId: string
  name: string
  email: string
  image: string | null
}

export interface DashboardInvitationRow {
  id: string
  email: string
  role: string | null
  status: string
  expiresAt: string
  createdAt: string
  delivery: InvitationDelivery | null
}

type InvitationDelivery = Pick<GuestThreadDeliveryRow, 'status' | 'provider' | 'provider_message_id' | 'error'>

export async function getInvitationDeliveries(db: DbClient, organizationId: string, invitations: {id:string;expiresAt:string}[]) {
  const rows = invitations.length ? await queryAll<InvitationDelivery & {id:string}>(db, `SELECT d.id,d.status,d.provider,d.provider_message_id,d.error FROM guest_thread_deliveries d
    JOIN activity_entries a ON a.id=d.entry_id WHERE a.organization_id=? AND a.scope_kind='organization' AND a.event_name='member.invited'
      AND d.id IN (SELECT value FROM json_each(?))`, [organizationId, JSON.stringify(invitations.map(invitation => `organization-invitation-email:${invitation.id}:${invitation.expiresAt}`))]) : []
  const byId = new Map(rows.map(({id,...delivery}) => [id, delivery]))
  return new Map(invitations.map(invitation => [invitation.id, byId.get(`organization-invitation-email:${invitation.id}:${invitation.expiresAt}`) ?? null]))
}

export async function getOrganizationTeamsData(env: CloudflareEnv, organizationId: string) {
  const adapter = await organizationAdapter(env)
  const teams = await adapter.listTeams(organizationId)
  return Promise.all(teams.map(async team => ({
    id: team.id, name: team.name, organization_id: team.organizationId,
    created_at: betterAuthTimestampToIso(team.createdAt as BetterAuthTimestamp, 'team.createdAt'),
    updated_at: team.updatedAt ? betterAuthTimestampToIso(team.updatedAt as BetterAuthTimestamp, 'team.updatedAt') : null,
    member_user_ids: (await adapter.listTeamMembers({ teamId: team.id })).map(member => member.userId),
  })))
}

// Shared by server/api/dashboard/members.get.ts and settings/members.vue's SSR
// branch — see the "Nested SSR self-fetch loses Cloudflare bindings" rule in
// the SSR boundary rule for why the page can't just $fetch its own API route.
export async function getOrganizationMembersData(env: CloudflareEnv, organizationId: string): Promise<{
  members: DashboardMemberRow[]
  invitations: DashboardInvitationRow[]
}> {
  const adapter = await organizationAdapter(env)
  const [memberRows, invitationRows] = await Promise.all([
    (async () => {
      const pageSize = 100
      const firstPage = await adapter.listMembers({ organizationId, limit: pageSize, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' })
      const rows = [...firstPage.members]
      for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
        const page = await adapter.listMembers({ organizationId, limit: pageSize, offset, sortBy: 'createdAt', sortOrder: 'asc' })
        rows.push(...page.members)
      }
      return rows
    })(),
    // Better Auth's own reading of "pending": not yet answered and not yet expired.
    adapter.findPendingInvitations({ organizationId }),
  ])
  const roleOrder = new Map([['owner', 0], ['admin', 1]])
  const members = memberRows.filter(member => member.user).map(member => ({
    id: member.id,
    role: String(member.role),
    createdAt: betterAuthTimestampToIso(member.createdAt as BetterAuthTimestamp, 'member.createdAt'),
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image ?? null,
  })).sort((left, right) => (roleOrder.get(left.role) ?? 99) - (roleOrder.get(right.role) ?? 99) || left.name.localeCompare(right.name))

  const invitationFacts = invitationRows.map(invitation => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role == null ? null : String(invitation.role),
    status: invitation.status,
    expiresAt: betterAuthTimestampToIso(invitation.expiresAt as BetterAuthTimestamp, 'invitation.expiresAt'),
    createdAt: betterAuthTimestampToIso(invitation.createdAt as BetterAuthTimestamp, 'invitation.createdAt'),
  })).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const deliveries = await getInvitationDeliveries(createDb(env.DB), organizationId, invitationFacts)
  const invitations = invitationFacts.map(invitation => ({...invitation, delivery:deliveries.get(invitation.id) ?? null}))

  return { members, invitations }
}
