// GET /api/admin/clients — paid organization clients
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionError, requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { queryAll } from '~/server/db'
import { createAuth } from '~/server/utils/auth'
import { betterAuthTimestampToIso, type BetterAuthTimestamp } from '~/server/utils/better-auth-timestamps'
import { getOrgAdapter } from 'better-auth/plugins'

interface ClientRow {
  org_id: string
  org_name: string | null
  org_slug: string | null
  plan: string
  site_id: string | null
  brand_name: string | null
  subdomain: string | null
  custom_domain: string | null
  subscription_status: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  pending_transfer_email: string | null
  impersonation_user_id: string | null
  created_at: string | null
}

interface BetterAuthOrganization {
  id?: unknown
  name?: unknown
  slug?: unknown
  createdAt?: unknown
}

interface BetterAuthMember {
  id?: unknown
  userId?: unknown
  role?: unknown
  createdAt?: unknown
  user?: { id?: unknown } | null
}

interface OrganizationAdapter {
  findOrganizationById(_organizationId: string): Promise<BetterAuthOrganization | null>
  listMembers(_input: {
    organizationId: string
    limit: number
    offset: number
    sortBy: string
    sortOrder: 'asc' | 'desc'
    filter: { field: string; operator: 'eq'; value: string }
  }): Promise<{ members: BetterAuthMember[]; total: number }>
}

interface ResolvedOrganization {
  id: string
  name: string
  slug: string
  createdAt: string
}

const PAID_PLAN_PRIORITY: Record<string, number> = {
  growth: 0, }

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Better Auth returned an invalid ${label}`)
  }
  return value.trim()
}

function normalizeOrganization(value: BetterAuthOrganization | null, organizationId: string): ResolvedOrganization {
  if (!value || value.id !== organizationId) {
    throw new Error(`Better Auth organization ${organizationId} is unavailable or malformed`)
  }
  const createdAt = value.createdAt
  if (
    typeof createdAt !== 'string'
    && typeof createdAt !== 'number'
    && !(createdAt instanceof Date)
  ) {
    throw new Error(`Better Auth organization ${organizationId} has an invalid createdAt`)
  }
  return {
    id: organizationId, name: requireNonEmptyString(value.name, `organization ${organizationId} name`), slug: requireNonEmptyString(value.slug, `organization ${organizationId} slug`), createdAt: betterAuthTimestampToIso(createdAt as BetterAuthTimestamp, `organization ${organizationId}.createdAt`), }
}

function normalizeMember(value: BetterAuthMember, organizationId: string, expectedRole: 'owner' | 'admin') {
  if (value.role !== expectedRole) {
    throw new Error(`Better Auth organization ${organizationId} returned a member outside the ${expectedRole} filter`)
  }
  const userId = typeof value.userId === 'string' && value.userId.trim()
    ? value.userId.trim()
    : typeof value.user?.id === 'string' && value.user.id.trim()
      ? value.user.id.trim()
      : null
  if (!userId) throw new Error(`Better Auth organization ${organizationId} returned a malformed ${expectedRole} member`)
  if (
    typeof value.createdAt !== 'string'
    && typeof value.createdAt !== 'number'
    && !(value.createdAt instanceof Date)
  ) {
    throw new Error(`Better Auth organization ${organizationId} returned a ${expectedRole} member without createdAt`)
  }
  return {
    userId, createdAt: betterAuthTimestampToIso(value.createdAt as BetterAuthTimestamp, `${expectedRole} member.createdAt`), id: typeof value.id === 'string' ? value.id : '', }
}

async function primaryWorkspaceMember(
  organizationAdapter: OrganizationAdapter, organizationId: string, ): Promise<string | null> {
  for (const role of ['owner', 'admin'] as const) {
    const result = await organizationAdapter.listMembers({
      organizationId, limit: 100, offset: 0, sortBy: 'createdAt', sortOrder: 'asc', filter: { field: 'role', operator: 'eq', value: role }, })
    if (!result || !Array.isArray(result.members) || !Number.isSafeInteger(result.total) || result.total < 0) {
      throw new Error(`Better Auth organization ${organizationId} returned a malformed ${role} member list`)
    }
    const members = result.members
      .map(member => normalizeMember(member, organizationId, role))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id) || left.userId.localeCompare(right.userId))
    if (members[0]) return members[0].userId
  }
  return null
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  try {
    await requirePlatformEventPermission(event, env, { platform: ['billing'] })
  } catch (error) {
    const { statusCode, message } = platformPermissionError(error)
    return jsonResponse({ error: message }, { status: statusCode })
  }

  const clients = await queryAll<ClientRow>(db, `
    WITH single_site AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at DESC) as rn
      FROM sites
    ), pending_transfer AS (
      SELECT from_organization_id, to_email, ROW_NUMBER() OVER (PARTITION BY from_organization_id ORDER BY created_at DESC) as rn
      FROM site_transfer_requests
      WHERE status = 'pending'
    )
    SELECT
      ob.organization_id AS org_id, NULL AS org_name, NULL AS org_slug, ob.access_plan AS plan, s.id AS site_id, s.brand_name, s.subdomain, s.custom_domain, ob.payment_status AS subscription_status, ob.access_expires_at AS current_period_end, ob.stripe_customer_id, ob.stripe_subscription_id, pt.to_email AS pending_transfer_email, NULL AS impersonation_user_id, NULL AS created_at
    FROM organization_billing ob
    LEFT JOIN single_site s ON s.organization_id = ob.organization_id AND s.rn = 1
    LEFT JOIN pending_transfer pt ON pt.from_organization_id = ob.organization_id AND pt.rn = 1
    WHERE ob.access_plan = 'growth'
      AND (ob.access_expires_at IS NULL OR ob.access_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `)

  const auth = createAuth(env)
  const authContext = await auth.$context
  const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {}) as unknown as OrganizationAdapter
  const resolvedClients = await Promise.all((clients ?? []).map(async (client) => {
    const organizationId = requireNonEmptyString(client.org_id, 'organization ID')
    const plan = requireNonEmptyString(client.plan, `organization ${organizationId} plan`).toLowerCase()
    if (!Object.prototype.hasOwnProperty.call(PAID_PLAN_PRIORITY, plan)) {
      throw new Error(`Organization ${organizationId} has an unsupported billing plan ${plan}`)
    }
    const organization = normalizeOrganization(
      await organizationAdapter.findOrganizationById(organizationId), organizationId, )
    return {
      ...client, org_id: organization.id, org_name: organization.name, org_slug: organization.slug, plan, created_at: organization.createdAt, impersonation_user_id: await primaryWorkspaceMember(organizationAdapter, organizationId), _organization_created_at: organization.createdAt, }
  }))

  resolvedClients.sort((left, right) => (
    PAID_PLAN_PRIORITY[left.plan]! - PAID_PLAN_PRIORITY[right.plan]!
    || right._organization_created_at.localeCompare(left._organization_created_at)
    || left.org_id.localeCompare(right.org_id)
  ))

  return jsonResponse({ clients: resolvedClients.map(({ _organization_created_at: _createdAt, ...client }) => client) })
})
import { defineHandler } from 'nitro';
