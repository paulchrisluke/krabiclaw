// Core site creation logic shared by site creation entry points. Handles org creation/lookup, idempotency,
// subdomain uniqueness, seeding, and Cloudflare subdomain registration.
import { seedNewSite } from '~/server/utils/site-template'
import { createSystemSubdomain } from '~/server/utils/domains'
import { getOrganizationBillingStatus, setSiteEntitlementsFromPlan, type BillingEnv } from '~/server/utils/billing'
import { execute, queryAll, queryFirst } from '~/server/db'
import { ALL_VERTICALS, type SiteVertical } from '~/utils/vertical-copy'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { ensureSiteTeam } from '~/server/utils/member-access'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { getOrgAdapter } from 'better-auth/plugins'

type SetupEnv = CloudflareEnv

interface SubdomainRow { subdomain: string }
interface UserOrganizationSiteRow {
  site_id: string | null
  onboarding_status: string | null
}

type OrganizationAdapter = ReturnType<typeof getOrgAdapter>

interface CreateOrganizationApi {
  createOrganization(_input: {
    body: {
      name: string
      slug: string
      userId: string
      keepCurrentActiveOrganization: true
    }
  }): Promise<{ id: string }>
}

async function organizationAdapter(env: CloudflareEnv): Promise<OrganizationAdapter> {
  const auth = createAuth(env)
  const context = await auth.$context
  return getOrgAdapter(context as Parameters<typeof getOrgAdapter>[0], {})
}

// Re-exported for existing callers (endpoint validation, tests) — the
// canonical list itself lives in utils/vertical-copy.ts (ALL_VERTICALS) so a
// third supported vertical only needs one array to update, not a duplicate
// here plus one in every UI vertical picker.
export const VALID_VERTICALS: SiteVertical[] = ALL_VERTICALS

export interface SiteCreationResult {
  status: number
  data: Record<string, unknown>
}

// sites.vertical has a narrower CHECK constraint (sites_vertical_check) than the
// app-level SiteVertical union — it accepts 'service' but not 'professional_service'.
// This is the single place that bridges the two: every caller of runSiteCreation
// passes the canonical app-level SiteVertical, and this function is the only thing
// that ever writes to sites.vertical, so there is exactly one alias translation.
function toStoredVertical(vertical: SiteVertical): string {
  return vertical === 'professional_service' ? 'service' : vertical
}

// Registry-driven: the template (and therefore theme_id) a site gets is derived
// from the same publicTemplateRegistry that already drives tenant routing/rendering
// (utils/template-registry.ts) — this is the only place site-creation decides a
// theme_id, so a future third template only needs a new registry entry, not a
// second hardcoded vertical-to-theme switch here.
function resolveThemeId(vertical: SiteVertical): string {
  return resolvePublicTemplate({ vertical }).themeId
}

export async function runSiteCreation(
  env: SetupEnv,
  db: D1Database,
  userId: string,
  params: { name: string; subdomain: string; vertical: SiteVertical }
): Promise<SiteCreationResult> {
  const { name, vertical } = params
  const normalizedSubdomain = params.subdomain.toLowerCase()
  let siteId = ''

  try {
    const existingSubdomain = await queryFirst<{ id: string }>(db, `
      SELECT id FROM sites WHERE subdomain = ? LIMIT 1
    `, [normalizedSubdomain])
    if (existingSubdomain) {
      return { status: 409, data: { error: 'This subdomain is already taken' } }
    }

    const themeId = resolveThemeId(vertical)
    const storedVertical = toStoredVertical(vertical)

    const { organizationId, existingRetrySiteId } = await resolveCreationOrganization(env, db, userId, name)
    if (existingRetrySiteId) {
      // A retry (pending/failed site from a previous attempt) may have been created
      // under a stale default (theme_id='saya-theme-v1', vertical='restaurant') —
      // correct both here so a professional-service retry can never be left on Saya.
      siteId = existingRetrySiteId
      await execute(db, `UPDATE sites SET theme_id = ?, vertical = ?, updated_at = ? WHERE id = ?`,
        [themeId, storedVertical, new Date().toISOString(), existingRetrySiteId])
      await ensureSiteTeam(db, { organizationId, siteId: existingRetrySiteId, name })
      return await performSeeding(env, db, existingRetrySiteId, organizationId, name, vertical, '')
    }

    siteId = crypto.randomUUID()
    try {
      await execute(db, `
        INSERT INTO sites
          (id, organization_id, theme_id, vertical, slug, subdomain, brand_name, status, plan, onboarding_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'free', 'pending', ?, ?)
      `, [siteId, organizationId, themeId, storedVertical, normalizedSubdomain, normalizedSubdomain, name, new Date().toISOString(), new Date().toISOString()])
    } catch (siteError) {
      const msg = siteError instanceof Error ? siteError.message : ''
      if (msg.includes('UNIQUE constraint failed')) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      throw siteError
    }
    await ensureSiteTeam(db, { organizationId, siteId, name })

    return await performSeeding(env, db, siteId, organizationId, name, vertical, normalizedSubdomain)

  } catch (error) {
    console.error('Site creation failed:', error instanceof Error ? error : new Error(String(error)))
    if (siteId) {
      await execute(db, `UPDATE sites SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), siteId]).catch(() => {})
    }
    return { status: 500, data: { error: 'Failed to create site. Please try again.' } }
  }
}

export async function resolveCreationOrganization(
  env: CloudflareEnv,
  db: D1Database,
  userId: string,
  name: string
): Promise<{ organizationId: string; existingRetrySiteId?: string }> {
  const adapter = await organizationAdapter(env)
  const organizations = (await adapter.listOrganizations(userId))
    .slice()
    .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt))

  const snapshots: Array<{
    organizationId: string
    role: string
    sites: UserOrganizationSiteRow[]
  }> = []

  for (const organization of organizations) {
    const member = await adapter.findMemberByOrgId({ userId, organizationId: organization.id })
    if (!member) continue

    const sites = await queryAll<UserOrganizationSiteRow>(db, `
      SELECT id AS site_id, onboarding_status
      FROM sites
      WHERE organization_id = ?
      ORDER BY created_at ASC
    `, [organization.id])
    snapshots.push({
      organizationId: organization.id,
      role: String(member.role),
      sites: sites ?? [],
    })
  }

  // Keep the original global priority: any owned pending/failed site is the
  // retry target before an empty-org rename or active-org multi-site reuse.
  const retrySnapshot = snapshots.find(snapshot => snapshot.role === 'owner'
    && snapshot.sites.some(site => site.site_id
      && (site.onboarding_status === 'pending' || site.onboarding_status === 'failed')))
  const retrySite = retrySnapshot?.sites.find(site =>
    site.site_id && (site.onboarding_status === 'pending' || site.onboarding_status === 'failed')
  )
  if (retrySnapshot && retrySite?.site_id) {
    return { organizationId: retrySnapshot.organizationId, existingRetrySiteId: retrySite.site_id }
  }

  const emptyOwnerOrg = snapshots.find(snapshot => snapshot.role === 'owner' && snapshot.sites.length === 0)
  if (emptyOwnerOrg) {
    await adapter.updateOrganization(emptyOwnerOrg.organizationId, {
      name,
      slug: await uniqueOrganizationSlug(adapter, name),
    })
    return { organizationId: emptyOwnerOrg.organizationId }
  }

  // Multi-site: if the user already owns an org with active sites, add the new site there.
  // The unique-per-org constraint was removed pre-squash (was migration 0017); now part of the 0001_initial.sql baseline.
  const existingOwnerOrg = snapshots.find(snapshot => snapshot.role === 'owner'
    && snapshot.sites.some(site => site.onboarding_status === 'active'))
  if (existingOwnerOrg) {
    return { organizationId: existingOwnerOrg.organizationId }
  }

  return await createOrganizationForSite(env, userId, name)
}

export async function createOrganizationForSite(env: CloudflareEnv, userId: string, name: string) {
  const adapter = await organizationAdapter(env)
  const slug = await uniqueOrganizationSlug(adapter, name)
  const auth = createAuth(env)
  const organizationApi = auth.api as unknown as CreateOrganizationApi
  try {
    const organization = await organizationApi.createOrganization({
      body: {
        name,
        slug,
        userId,
        keepCurrentActiveOrganization: true,
      },
    })
    return { organizationId: organization.id }
  } catch (error) {
    // Better Auth creates the organization before adding its owner member.
    // If that second step fails, locate the just-created unique slug and
    // remove it only when the expected owner member is absent. Never delete an
    // organization that already has this user as its owner.
    const partial = await adapter.findOrganizationBySlug(slug).catch(() => null)
    if (partial) {
      const expectedOwner = await adapter.findMemberByOrgId({
        userId,
        organizationId: partial.id,
      }).catch(() => null)
      if (!expectedOwner || String(expectedOwner.role) !== 'owner') {
        await adapter.deleteOrganization(partial.id).catch((cleanupError) => {
          console.error('Failed to clean up partially-created organization', {
            organizationId: partial.id,
            error: cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
          })
        })
      }
    }
    throw error
  }
}

async function uniqueOrganizationSlug(adapter: OrganizationAdapter, name: string) {
  const base = slugifyName(name)
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const existing = await adapter.findOrganizationBySlug(slug)
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function timestampValue(value: Date | string | number): number {
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

export async function findOldestOwnedOrganization(
  env: CloudflareEnv,
  userId: string,
): Promise<string | null> {
  const adapter = await organizationAdapter(env)
  const organizations = (await adapter.listOrganizations(userId))
    .slice()
    .sort((left, right) => timestampValue(left.createdAt) - timestampValue(right.createdAt))
  for (const organization of organizations) {
    const member = await adapter.findMemberByOrgId({ userId, organizationId: organization.id })
    if (member && String(member.role) === 'owner') return organization.id
  }
  return null
}

// Dev-only helper: the development login route creates a pre-cookie session
// internally, so it cannot call the request-bound Better Auth endpoint yet.
export async function setActiveOrganizationForDevSession(
  env: CloudflareEnv,
  sessionToken: string,
  organizationId: string,
): Promise<void> {
  const auth = createAuth(env)
  const context = await auth.$context
  const adapter = getOrgAdapter(context as Parameters<typeof getOrgAdapter>[0], {})
  // The installed Better Auth adapter's third argument is the endpoint context
  // used by HTTP handlers; its setActiveOrganization implementation only calls
  // internalAdapter.updateSession, so the shared auth context is sufficient for
  // non-HTTP callers.
  type AdapterContext = Parameters<OrganizationAdapter['setActiveOrganization']>[2]
  await adapter.setActiveOrganization(sessionToken, organizationId, context as unknown as AdapterContext)
}

function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

async function performSeeding(
  env: SetupEnv,
  db: D1Database,
  siteId: string,
  organizationId: string,
  name: string,
  vertical: SiteVertical,
  subdomain: string
): Promise<SiteCreationResult> {
  const now = new Date().toISOString()
  try {
    await seedNewSite(db, { organizationId, siteId, name, vertical })

    const resolvedSubdomain = subdomain || await queryFirst<SubdomainRow>(
      db, 'SELECT subdomain FROM sites WHERE id = ?', [siteId]
    ).then(r => r?.subdomain)

    if (!resolvedSubdomain?.trim()) throw new Error(`Missing subdomain for site ${siteId}`)

    await createSystemSubdomain(env, db, siteId, organizationId, resolvedSubdomain)

    // New sites start with the organization's current plan projection. The
    // organization subscription remains the sole recurring Stripe subscription.
    const organizationBilling = await getOrganizationBillingStatus(env as BillingEnv, db, organizationId)
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, organizationBilling.plan)

    await execute(db, `UPDATE sites SET onboarding_status = 'active', updated_at = ? WHERE id = ?`, [now, siteId])

    // Surface whether another site in this org is already on a paid plan so the
    // caller can offer the organization owner the Better Auth Stripe upgrade flow.
    const existingPaidSite = await queryFirst<{ plan: string }>(db, `
      SELECT sb.plan FROM site_billing sb
      WHERE sb.organization_id = ? AND sb.site_id != ? AND sb.status = 'active' AND sb.plan != 'free'
      ORDER BY sb.updated_at DESC LIMIT 1
    `, [organizationId, siteId])

    return {
      status: 200,
      data: {
        siteId,
        organizationId,
        subdomain: resolvedSubdomain,
        message: 'Site created successfully',
        offerSubscribePlan: existingPaidSite?.plan ?? null,
      }
    }

  } catch (seedError) {
    console.error('Seeding failed:', seedError instanceof Error ? seedError : new Error(String(seedError)))
    await execute(db, `UPDATE sites SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`, [now, siteId]).catch(() => {})
    throw new Error('Failed to complete required site setup')
  }
}
