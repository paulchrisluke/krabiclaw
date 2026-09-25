import { HTTPError } from 'nitro';

import { queryFirst, type DbClient } from '~/server/db'
import { getOrgAdapter, hasPermission } from 'better-auth/plugins'
import { parsePhoneOrThrow } from '~/utils/phone'
import { oncePerRequest } from '~/server/utils/request-scope'
import type { H3Event } from 'nitro'
import type { CloudflareEnv, organizationOptions } from '~/server/utils/auth'
import type { OrganizationPermissions } from '~/utils/organization-access'

// Authorization is the Better Auth organization role. Owner and admin are the
// roles, both organization-wide, and there is no second way to answer whether
// someone may reach a location.
//
// There used to be one: a `location:<id>` Better Auth team, which scoped an
// `editor`. That role existed so a phone number configured on a location could
// be a notification target without being an owner. Notifications now resolve
// from the member to their own verified phone, so the number needs no role, the
// role needed no team, and none of it had a single user.

/**
 * A membership this request actually resolved: one lookup keyed by
 * (organizationId, userId) that produced all three of these fields together.
 *
 * The brand is what makes that a fact rather than a convention. Only the
 * resolvers in this module mint one, so `organizationId` and `role` cannot
 * come from different places — which is precisely the mistake the scope checks
 * below can no longer catch now that they trust `role` instead of re-reading
 * the member row.
 */
declare const resolvedMembership: unique symbol
export interface ResolvedMembership {
  readonly [resolvedMembership]: true
  readonly userId: string
  readonly organizationId: string
  readonly role: string
}

/** The one place a ResolvedMembership is made. Not exported. */
function resolvedMembershipOf<T extends { userId: string; organizationId: string; role: string }>(fields: T): T & ResolvedMembership {
  return fields as T & ResolvedMembership
}

/**
 * Who is asking, about which tenant.
 *
 * `userId`, `role` and `organizationId` are not writable by the caller: they
 * are read off a ResolvedMembership, so the scope checks can trust that `role`
 * belongs to `organizationId` without reading the member row back.
 *
 * The tenant is the organization the membership resolved against. It used to
 * also carry a `organizationId` the caller supplied separately, which is how a request
 * could authorize against one tenant and then read another.
 */
export interface MemberAccessPrincipal {
  readonly [resolvedMembership]: true
  readonly env: CloudflareEnv
  // The authenticated user, not the member row id.
  readonly userId: string
  readonly role: string
  readonly organizationId: string
  // The request this principal was minted for, when there is one. Only used to
  // memoize the team read the scope checks share; absent for scheduled work.
  readonly event?: H3Event
}

export function memberAccessPrincipal(
  membership: ResolvedMembership,
  input: { env: CloudflareEnv; event?: H3Event },
): MemberAccessPrincipal {
  return {
    env: input.env,
    userId: membership.userId,
    role: membership.role,
    organizationId: membership.organizationId,
    event: input.event,
  } as MemberAccessPrincipal
}

export async function resolveMemberId(
  input: { organizationId: string; userId: string; env: CloudflareEnv },
): Promise<string | null> {
  if (!input.env) {
    throw new Error('resolveMemberId requires CloudflareEnv so Better Auth can resolve organization membership')
  }
  const { createAuth } = await import('~/server/utils/auth')
  const auth = createAuth(input.env)
  const authContext = await auth.$context
  const orgAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
  const member = await orgAdapter.findMemberByOrgId({
    userId: input.userId,
    organizationId: input.organizationId,
  })
  return member?.id ?? null
}

export async function findLocation(
  db: DbClient,
  input: { organizationId: string; locationId: string },
): Promise<{ id: string } | null> {
  return await queryFirst<{ id: string }>(db, `
    SELECT id FROM business_locations
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [input.locationId, input.organizationId])
}

export function isOrganizationWideRole(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * What a role may do, answered by Better Auth.
 *
 * `utils/organization-access.ts` declares the statements and the two roles,
 * and the plugin is configured with them (`organizationOptions.ac/roles`), so
 * this is the repository's one description of what each role can reach. It used
 * to be reached only by billing; everything else re-decided the same question
 * by hand — `role === 'owner' || role === 'admin'`, an MCP rank ladder, and a
 * list of dashboard route strings, three answers that could drift from the
 * matrix and from each other.
 *
 * `hasPermission` evaluates the role's statements in memory. It reads the
 * database only under `dynamicAccessControl`, which is off here, so this costs
 * no round trip.
 *
 * This answers "may this role do X at all". Which tenant is the membership the
 * principal was minted from; there is no narrower scope than the organization.
 */
export type { OrganizationPermissions }

export async function roleAllows(
  input: { organizationId: string; role: string; permissions: OrganizationPermissions },
): Promise<boolean> {
  const { organizationOptions: options } = await import('~/server/utils/auth')
  return await hasPermission({
    organizationId: input.organizationId,
    role: input.role,
    options,
    permissions: input.permissions,
  }, undefined as never)
}

export async function assertRoleAllows(
  input: { organizationId: string; role: string; permissions: OrganizationPermissions; message?: string },
): Promise<void> {
  if (await roleAllows(input)) return
  throw new HTTPError({ statusCode: 403, message: input.message ?? 'Access denied' })
}

// The adapter has to be built with the same organization options the plugin
// runs with: getOrgAdapter filters organization output through the options'
// additionalFields, so an adapter built with {} silently drops
// deletionScheduledAt and every role/team limit the plugin was configured with.
export type OrganizationAdapter = ReturnType<typeof getOrgAdapter<typeof organizationOptions>>

export async function organizationAdapter(env: CloudflareEnv): Promise<OrganizationAdapter> {
  const { createAuth, organizationOptions: options } = await import('~/server/utils/auth')
  const auth = createAuth(env)
  const context = await auth.$context
  return getOrgAdapter(context as Parameters<typeof getOrgAdapter>[0], options)
}

/**
 * The two Better Auth reads every membership resolution is made of, memoized
 * for the life of one request.
 *
 * A dashboard render resolves the same membership twice: getDashboardContext
 * looks the organization up by slug, loadMemberOrganizationRow looks it up by id, and
 * each then reads the same member row for the same user. Neither can change
 * mid-request. Pass the event and the second resolution is free; without one
 * (scheduled jobs, tenant deletion) they read as before.
 */
function organizationById(env: CloudflareEnv, id: string, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).findOrganizationById(id)
  return event ? oncePerRequest(event, `organization:${id}`, read) : read()
}

function organizationBySlug(env: CloudflareEnv, slug: string, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).findOrganizationBySlug(slug)
  return event ? oncePerRequest(event, `organization-slug:${slug}`, read) : read()
}

function membershipRow(env: CloudflareEnv, input: { organizationId: string; userId: string }, event?: H3Event) {
  const read = async () => (await organizationAdapter(env)).findMemberByOrgId(input)
  return event ? oncePerRequest(event, `membership:${input.organizationId}:${input.userId}`, read) : read()
}

export async function resolveOrganizationMembership(
  env: CloudflareEnv,
  input: { organizationId: string; userId: string },
  event?: H3Event,
): Promise<(ResolvedMembership & { memberId: string; organizationSlug: string; organizationName: string }) | null> {
  const [member, organization] = await Promise.all([
    membershipRow(env, input, event),
    organizationById(env, input.organizationId, event),
  ])
  if (!member || !organization) return null
  return resolvedMembershipOf({
    userId: input.userId,
    organizationId: input.organizationId,
    role: String(member.role),
    memberId: member.id,
    organizationSlug: organization.slug,
    organizationName: organization.name,
  })
}

/**
 * The membership alone, for a caller that already has an organization id but no
 * proof the asker belongs to it — an SSR data loader reading the id off the
 * rendered payload, an OAuth callback reading it out of its own state.
 *
 * One read. resolveOrganizationMembership and resolveUserOrganization also
 * fetch the organization row for its name and slug; a caller that only needs to
 * authorize does not.
 */
export async function resolveMembership(
  env: CloudflareEnv,
  input: { organizationId: string; userId: string },
): Promise<ResolvedMembership | null> {
  const adapter = await organizationAdapter(env)
  const member = await adapter.findMemberByOrgId(input)
  if (!member) return null
  return resolvedMembershipOf({
    userId: input.userId,
    organizationId: input.organizationId,
    role: String(member.role),
  })
}

export async function resolveUserOrganization(
  env: CloudflareEnv,
  input: { userId: string; organizationId?: string | null; organizationSlug?: string | null },
  event?: H3Event,
): Promise<(ResolvedMembership & {
  id: string
  name: string
  slug: string
  memberId: string
}) | null> {
  const organization = input.organizationId
    ? await organizationById(env, input.organizationId, event)
    : input.organizationSlug
      ? await organizationBySlug(env, input.organizationSlug, event)
      : null
  if (!organization) return null
  const member = await membershipRow(env, { userId: input.userId, organizationId: organization.id }, event)
  if (!member) return null
  return resolvedMembershipOf({
    userId: input.userId,
    organizationId: organization.id,
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: String(member.role),
    memberId: member.id,
  })
}

// adapter.listMembers pages at 100 by default — every caller that needs the
// complete membership (not just a bounded page for display) must walk every
// page via its own total, or a large organization silently loses members
// past the first 100.
async function listAllOrganizationMembers(adapter: OrganizationAdapter, organizationId: string) {
  const pageSize = 100
  const firstPage = await adapter.listMembers({ organizationId, limit: pageSize, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' })
  const members = [...firstPage.members]
  for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
    const page = await adapter.listMembers({ organizationId, limit: pageSize, offset, sortBy: 'createdAt', sortOrder: 'asc' })
    members.push(...page.members)
  }
  return members
}

/**
 * The person internal alerts go to, as an identity rather than just an address.
 *
 * The user id comes back with the email because a notification preference is
 * per person (user_notification_preferences), so the sender needs to know whose
 * preference applies, not only where to post the message.
 */
/**
 * Everyone this tenant's internal alerts may go to, as identities.
 *
 * One list for both channels. This used to pick a single owner/admin for email
 * — sorted so that an `@example.test` address lost a tie, a test concern
 * deciding who a real tenant hears from — while WhatsApp went to whatever
 * number was typed into a settings field. Two sources, two answers, and a
 * location's own people could be in neither.
 *
 * Who is the membership; whether, and over which channel, is each person's own
 * `user_notification_preferences`; where is their account email and their
 * verified phone. A member with no verified phone simply has no WhatsApp
 * address, which is not a failure and nothing to report.
 */
export interface OrganizationNotificationMember {
  userId: string
  email: string
  phone: string | null
}

export async function listOrganizationNotificationMembers(
  env: CloudflareEnv,
  organizationId: string,
): Promise<OrganizationNotificationMember[]> {
  const adapter = await organizationAdapter(env)
  const members = await listAllOrganizationMembers(adapter, organizationId)
  // Keyed by user, not by member row: a duplicated membership must not become
  // a duplicated alert.
  const byUserId = new Map<string, { id: string; email: string }>()
  for (const member of members) {
    if (!member.user || !isOrganizationWideRole(String(member.role))) continue
    byUserId.set(member.user.id, { id: member.user.id, email: member.user.email })
  }
  if (byUserId.size === 0) return []

  // listMembers carries only the identity columns Better Auth shows next to a
  // member, so the verified phone is read from the user model through the same
  // adapter that owns it. Reading `member.user.phoneNumber` silently produced
  // undefined for everyone, which is a tenant hearing nothing on WhatsApp.
  const { createAuth } = await import('~/server/utils/auth')
  const context = await createAuth(env).$context
  const userAdapter = context.adapter as unknown as {
    findMany<T>(_input: {
      model: string
      where: Array<{ field: string; operator: string; value: string[] }>
      select?: string[]
      limit?: number
    }): Promise<T[]>
  }
  const ids = [...byUserId.keys()]
  const rows = await userAdapter.findMany<{ id: string; phoneNumber: string | null; phoneNumberVerified: boolean | number | null }>({
    model: 'user',
    where: [{ field: 'id', operator: 'in', value: ids }],
    select: ['id', 'phoneNumber', 'phoneNumberVerified'],
    limit: ids.length,
  })
  const verifiedPhone = new Map(rows.map(row => [
    row.id,
    row.phoneNumber && row.phoneNumberVerified ? row.phoneNumber : null,
  ]))

  return ids.map(id => ({
    userId: id,
    email: byUserId.get(id)!.email,
    phone: verifiedPhone.get(id) ?? null,
  }))
}

export async function listUserOrganizations(env: CloudflareEnv, userId: string) {
  const adapter = await organizationAdapter(env)
  return await adapter.listOrganizations(userId)
}

export async function findOrganizationMemberById(
  env: CloudflareEnv,
  memberId: string,
): Promise<{ id: string; userId: string; organizationId: string; role: string } | null> {
  const adapter = await organizationAdapter(env)
  const member = await adapter.findMemberById(memberId)
  if (!member) return null
  return {
    id: member.id,
    userId: member.userId,
    organizationId: member.organizationId,
    role: String(member.role),
  }
}

export async function findOrganizationById(env: CloudflareEnv, organizationId: string) {
  return await organizationAdapter(env).then(adapter => adapter.findOrganizationById(organizationId))
}

export async function listOrganizationMembers(env: CloudflareEnv, organizationId: string) {
  const adapter = await organizationAdapter(env)
  return await listAllOrganizationMembers(adapter, organizationId)
}

export async function deleteOrganization(env: CloudflareEnv, organizationId: string): Promise<void> {
  await organizationAdapter(env).then(adapter => adapter.deleteOrganization(organizationId))
}

/**
 * Organization-wide management access, which is now the only kind.
 *
 * Authorization is the Better Auth organization role and nothing else. There
 * used to be a second answer — membership in a `location:<id>` Better Auth
 * team — so "may this person reach this location" could be decided two ways.
 * That existed to scope the `editor` role, `editor` existed to receive WhatsApp
 * at a configured number, and neither has any user.
 */
export async function assertOrganizationWideAccess(_db: DbClient, input: MemberAccessPrincipal): Promise<void> {
  if (isOrganizationWideRole(input.role)) return
  throw new HTTPError({ statusCode: 404, message: 'Not found or access denied' })
}

/** The location must belong to the tenant the caller authorized against; reaching it is the organization role. */
export async function assertLocationAccess(db: DbClient, input: MemberAccessPrincipal & { locationId: string }): Promise<void> {
  await assertOrganizationWideAccess(db, input)
  const location = await findLocation(db, { organizationId: input.organizationId, locationId: input.locationId })
  if (!location) throw new HTTPError({ statusCode: 404, message: 'Resource not found' })
}

/** A resource that may or may not belong to one location (e.g. a review row) — dispatches to assertOrganizationWideAccess when the row's own location_id is null, assertLocationAccess otherwise. Check the target row's location_id, never a caller-supplied param. Media authorization uses its placement owner instead. */
export async function assertResourceAccess(db: DbClient, input: MemberAccessPrincipal & { resourceLocationId: string | null }): Promise<void> {
  if (input.resourceLocationId === null) {
    return assertOrganizationWideAccess(db, input)
  }
  return assertLocationAccess(db, { ...input, locationId: input.resourceLocationId })
}

export async function assertMemberScope(db: DbClient, input: MemberAccessPrincipal & { locationId?: string | null }): Promise<void> {
  if (input.locationId) {
    await assertLocationAccess(db, { ...input, locationId: input.locationId })
    return
  }
  await assertOrganizationWideAccess(db, input)
}

/**
 * Who, if anyone, may act on this tenant from this WhatsApp number.
 *
 * The number here is the one Meta reports as the sender of an inbound message,
 * never a number a tenant typed into a settings field. Outbound alerts resolve
 * the other way round — from the member to their own verified phone — so there
 * is no configured number left to authorize.
 *
 * Returns the user id rather than a bare boolean because the caller also has to
 * honour that person's own preferences, and resolving the number to an account
 * twice would be two implementations of one lookup.
 */
export interface WhatsAppSenderScope {
  organizationId: string
  env: CloudflareEnv
  phone: string
}

export async function resolveAuthorizedWhatsAppRecipient(
  _db: DbClient,
  input: WhatsAppSenderScope,
): Promise<{ userId: string } | null> {
  const { findVerifiedAuthUserByPhone } = await import('~/server/utils/auth')
  const user = await findVerifiedAuthUserByPhone(
    input.env,
    parsePhoneOrThrow(input.phone, { defaultCountry: 'TH' }),
  )
  if (!user) return null
  const membership = await resolveOrganizationMembership(input.env, {
    organizationId: input.organizationId,
    userId: user.id,
  })
  if (!membership || !isOrganizationWideRole(membership.role)) return null
  return { userId: user.id }
}

export async function isAuthorizedWhatsAppRecipient(
  db: DbClient,
  input: WhatsAppSenderScope,
): Promise<boolean> {
  return (await resolveAuthorizedWhatsAppRecipient(db, input)) !== null
}
