// Core site creation logic shared by site creation entry points. Handles org creation/lookup,
// idempotency, subdomain uniqueness, and seeding.
import { seedNewSite } from '~/server/utils/site-template'
import { createSystemSubdomain, isSystemSubdomainSpent } from '~/server/utils/domains'
import { getOrganizationBillingStatus, setSiteEntitlementsFromPlan, type BillingEnv } from '~/server/utils/billing'
import { execute, executeBatch, queryAll, queryFirst } from '~/server/db'
import { ALL_VERTICALS, type SiteVertical } from '~/utils/vertical-copy'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { ensureSiteTeam, organizationAdapter } from '~/server/utils/member-access'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import type { getOrgAdapter } from 'better-auth/plugins'

type SetupEnv = CloudflareEnv

interface SubdomainRow { subdomain: string }
interface UserOrganizationSiteRow {
  site_id: string | null
  onboarding_status: string | null
}

type OrganizationAdapter = ReturnType<typeof getOrgAdapter>
const SITE_CREATION_MARKER_KEY = '__krabiclaw_site_creation_marker'

interface CreateOrganizationApi {
  createOrganization(_input: {
    body: {
      name: string
      slug: string
      userId: string
      keepCurrentActiveOrganization: true
      metadata: Record<string, string>
    }
  }): Promise<{ id: string }>
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function markSiteCreationFailed(db: D1Database, siteId: string, cause: unknown): Promise<Error> {
  try {
    await execute(db, `UPDATE sites SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), siteId])
  } catch (cleanupError) {
    return new AggregateError(
      [asError(cause), asError(cleanupError)],
      `Site ${siteId} setup failed and its failure status could not be persisted`,
    )
  }
  return asError(cause)
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
  params: { name: string; subdomain: string; vertical: SiteVertical },
  options?: { beforeSiteMutation?: (_organizationId: string) => Promise<void> },
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
    if (await isSystemSubdomainSpent(env, db, normalizedSubdomain)) {
      return { status: 409, data: { error: 'This subdomain is permanently unavailable' } }
    }

    const themeId = resolveThemeId(vertical)
    const storedVertical = toStoredVertical(vertical)

    const { organizationId, existingRetrySiteId } = await resolveCreationOrganization(env, db, userId, name)
    await options?.beforeSiteMutation?.(organizationId)
    if (existingRetrySiteId) {
      // A retry (pending/failed site from a previous attempt) may have been created
      // under a stale default (theme_id='saya-theme-v1', vertical='restaurant') —
      // correct both here so a professional-service retry can never be left on Saya.
      siteId = existingRetrySiteId
      await execute(db, `UPDATE sites SET theme_id = ?, vertical = ?, updated_at = ? WHERE id = ?`,
        [themeId, storedVertical, new Date().toISOString(), existingRetrySiteId])
      await ensureSiteTeam(db, { env, organizationId, siteId: existingRetrySiteId, name })
      return await performSeeding(env, db, existingRetrySiteId, organizationId, name, vertical, '')
    }

    siteId = crypto.randomUUID()
    try {
      const now = new Date().toISOString()
      await executeBatch(db, [
        {
          query: `
            INSERT INTO sites
              (id, organization_id, theme_id, vertical, slug, subdomain, brand_name, default_currency, status, plan, onboarding_status, analytics_data_start_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'active', 'free', 'pending', ?, ?, ?)
          `,
          params: [siteId, organizationId, themeId, storedVertical, normalizedSubdomain, normalizedSubdomain, name, now, now, now],
        },
        {
          query: `
            INSERT INTO site_locales
              (id, organization_id, site_id, locale, label, is_source, status, created_at, updated_at)
            VALUES (?, ?, ?, 'en', 'English', 1, 'published', ?, ?)
          `,
          params: [`locale::${organizationId}::${siteId}::en`, organizationId, siteId, now, now],
        },
      ], { operation: 'create site and source locale' })
    } catch (siteError) {
      const msg = siteError instanceof Error ? siteError.message : ''
      if (msg.includes('UNIQUE constraint failed')) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      throw siteError
    }
    await ensureSiteTeam(db, { env, organizationId, siteId, name })

    return await performSeeding(env, db, siteId, organizationId, name, vertical, normalizedSubdomain)

  } catch (error) {
    console.error('Site creation failed:', asError(error))
    const failure = siteId ? await markSiteCreationFailed(db, siteId, error) : asError(error)
    return { status: 500, data: { error: failure.message } }
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
  const creationMarker = crypto.randomUUID()
  try {
    const organization = await organizationApi.createOrganization({
      body: {
        name,
        slug,
        userId,
        keepCurrentActiveOrganization: true,
        metadata: { [SITE_CREATION_MARKER_KEY]: creationMarker },
      },
    })
    const created = await adapter.findOrganizationBySlug(slug)
    if (created?.id === organization.id) {
      const metadata = organizationMetadata(created.metadata)
      if (metadata[SITE_CREATION_MARKER_KEY] === creationMarker) {
        Reflect.deleteProperty(metadata, SITE_CREATION_MARKER_KEY)
        await adapter.updateOrganization(organization.id, {
          metadata,
        })
      }
    }
    return { organizationId: organization.id }
  } catch (error) {
    // Better Auth creates the organization before adding its owner member.
    // If that second step fails, locate the just-created unique slug and
    // remove it only when the expected owner member is absent. Never delete an
    // organization that already has this user as its owner.
    let partial
    try {
      partial = await adapter.findOrganizationBySlug(slug)
    } catch (lookupError) {
      throw new AggregateError(
        [asError(error), asError(lookupError)],
        `Organization creation failed and partial organization ${slug} could not be inspected`,
      )
    }
    if (partial) {
      let expectedOwner
      try {
        expectedOwner = await adapter.findMemberByOrgId({
          userId,
          organizationId: partial.id,
        })
      } catch (lookupError) {
        throw new AggregateError(
          [asError(error), asError(lookupError)],
          `Organization creation failed and owner state for ${partial.id} could not be inspected`,
        )
      }
      const metadata = organizationMetadata(partial.metadata)
      if (metadata[SITE_CREATION_MARKER_KEY] === creationMarker
        && (!expectedOwner || String(expectedOwner.role) !== 'owner')) {
        try {
          await adapter.deleteOrganization(partial.id)
        } catch (cleanupError) {
          throw new AggregateError(
            [asError(error), asError(cleanupError)],
            `Organization creation failed and partial organization ${partial.id} could not be deleted`,
          )
        }
      }
    }
    throw error
  }
}

function organizationMetadata(value: unknown): Record<string, unknown> {
  if (isMetadataRecord(value)) return { ...value }
  if (typeof value !== 'string') return {}
  const parsed: unknown = JSON.parse(value)
  if (!isMetadataRecord(parsed)) throw new Error('Stored organization metadata is invalid')
  return { ...parsed }
}

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

  return {
    status: 200,
    data: {
      siteId,
      organizationId,
      subdomain: resolvedSubdomain,
      message: 'Site created successfully',
    }
  }
}
