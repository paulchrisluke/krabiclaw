import { getOrgAdapter } from 'better-auth/plugins'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'

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
  inviterName: string | null
}

// Shared by server/api/dashboard/members.get.ts and settings/members.vue's SSR
// branch — see the "Nested SSR self-fetch loses Cloudflare bindings" rule in
// the SSR boundary rule for why the page can't just $fetch its own API route.
export async function getOrganizationMembersData(env: CloudflareEnv, organizationId: string): Promise<{
  members: DashboardMemberRow[]
  invitations: DashboardInvitationRow[]
}> {
  const auth = createAuth(env)
  const authContext = await auth.$context
  const adapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
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
    adapter.listInvitations({ organizationId }),
  ])
  const roleOrder = new Map([['owner', 0], ['admin', 1], ['editor', 2]])
  const members = memberRows.filter(member => member.user).map(member => ({
    id: member.id,
    role: String(member.role),
    createdAt: betterAuthTimestampToIso(member.createdAt as BetterAuthTimestamp, 'member.createdAt'),
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    image: member.user.image ?? null,
  })).sort((left, right) => (roleOrder.get(left.role) ?? 99) - (roleOrder.get(right.role) ?? 99) || left.name.localeCompare(right.name))

  const invitations = invitationRows.filter(invitation => invitation.status === 'pending').map(invitation => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role == null ? null : String(invitation.role),
    status: invitation.status,
    inviterName: null,
    expiresAt: betterAuthTimestampToIso(invitation.expiresAt as BetterAuthTimestamp, 'invitation.expiresAt'),
    createdAt: betterAuthTimestampToIso(invitation.createdAt as BetterAuthTimestamp, 'invitation.createdAt'),
  })).sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return { members, invitations }
}
