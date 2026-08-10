import { getOrgAdapter } from 'better-auth/plugins'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import {
  adminHeadersForEvent,
  authAdminApi,
} from '~/server/utils/platform-admin-users'
import type { H3Event } from 'h3'

export type TransferRecipientResolutionStatus =
  | 'missing'
  | 'ambiguous'
  | 'no_owned_organization'
  | 'ready'

export interface TransferRecipientOrganization {
  id: string
  name: string
  slug: string
}

export interface TransferRecipientResolution {
  email: string
  status: TransferRecipientResolutionStatus
  userId: string | null
  organizations: TransferRecipientOrganization[]
}

interface RecipientUser {
  id: string
  email: string
}

interface RecipientOrganization {
  id: string
  name: string
  slug: string
}

interface RecipientOrganizationAdapter {
  listOrganizations(_userId: string): Promise<RecipientOrganization[]>
  findMemberByOrgId(_input: { userId: string; organizationId: string }): Promise<{ role?: unknown } | null>
}

function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase()
}

function sortOrganizations(
  organizations: TransferRecipientOrganization[],
): TransferRecipientOrganization[] {
  return [...organizations].sort((left, right) => (
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    || left.slug.localeCompare(right.slug, undefined, { sensitivity: 'base' })
    || left.id.localeCompare(right.id)
  ))
}

function normalizeOrganization(organization: RecipientOrganization): TransferRecipientOrganization {
  for (const field of ['id', 'name', 'slug'] as const) {
    if (typeof organization[field] !== 'string' || organization[field].trim() === '') {
      throw new Error(`Better Auth returned an invalid recipient organization ${field}`)
    }
  }
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  }
}

/**
 * Resolve an already-fetched Better Auth user list to the exact account and
 * the organizations that account owns. This pure boundary is intentionally
 * separate from the Admin API call so tests can exercise the exact-match and
 * ownership rules without constructing a Worker auth context.
 */
export async function resolveTransferRecipientOrganizationsFromUsers(input: {
  email: string
  users: RecipientUser[]
  organizationAdapter: RecipientOrganizationAdapter
}): Promise<TransferRecipientResolution> {
  const email = normalizeRecipientEmail(input.email)
  if (!email) {
    return {
      email,
      status: 'missing',
      userId: null,
      organizations: [],
    }
  }

  const matches = input.users.filter((user) => (
    typeof user.email === 'string'
    && normalizeRecipientEmail(user.email) === email
  ))

  if (matches.length === 0) {
    return { email, status: 'missing', userId: null, organizations: [] }
  }
  if (matches.length !== 1) {
    return { email, status: 'ambiguous', userId: null, organizations: [] }
  }

  const recipientUser = matches[0]!
  if (typeof recipientUser.id !== 'string' || recipientUser.id.trim() === '') {
    throw new Error('Better Auth returned an invalid transfer recipient user ID')
  }
  const organizations = (await input.organizationAdapter.listOrganizations(recipientUser.id))
    .map(normalizeOrganization)
  const ownedOrganizations = await Promise.all(organizations.map(async (organization) => {
    const membership = await input.organizationAdapter.findMemberByOrgId({
      userId: recipientUser.id,
      organizationId: organization.id,
    })
    if (String(membership?.role ?? '') !== 'owner') return null
    return organization
  }))

  const normalizedOrganizations = sortOrganizations(
    ownedOrganizations.filter((organization): organization is TransferRecipientOrganization => organization !== null),
  )

  return {
    email,
    status: normalizedOrganizations.length > 0 ? 'ready' : 'no_owned_organization',
    userId: recipientUser.id,
    organizations: normalizedOrganizations,
  }
}

/**
 * Resolve transfer recipients through Better Auth's documented Admin API and
 * organization adapter. Better Auth-owned user/member tables are deliberately
 * not queried here.
 */
export async function resolveTransferRecipientOrganizations(
  env: CloudflareEnv,
  headers: HeadersInit,
  email: string,
): Promise<TransferRecipientResolution> {
  const normalizedEmail = normalizeRecipientEmail(email)
  if (!normalizedEmail) {
    return {
      email: normalizedEmail,
      status: 'missing',
      userId: null,
      organizations: [],
    }
  }
  const adminApi = authAdminApi(env)
  const result = await adminApi.listUsers({
    query: {
      searchValue: normalizedEmail,
      filterField: 'email',
      filterValue: normalizedEmail,
      filterOperator: 'eq',
      limit: 50,
      offset: 0,
    },
    headers,
  })

  const auth = createAuth(env)
  const authContext = await auth.$context
  const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})

  return resolveTransferRecipientOrganizationsFromUsers({
    email: normalizedEmail,
    users: result.users,
    organizationAdapter,
  })
}

export function resolveTransferRecipientOrganizationsForEvent(
  event: H3Event,
  env: CloudflareEnv,
  email: string,
): Promise<TransferRecipientResolution> {
  return resolveTransferRecipientOrganizations(env, adminHeadersForEvent(event), email)
}
