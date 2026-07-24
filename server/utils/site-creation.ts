// Core site creation logic shared by site creation entry points. Handles org creation/lookup, idempotency,
// subdomain uniqueness, seeding, and Cloudflare subdomain registration.
import { seedNewSite } from '~/server/utils/site-template'
import { createSystemSubdomain } from '~/server/utils/domains'
import { setSiteEntitlementsFromPlan } from '~/server/utils/billing'
import { execute, executeBatch, queryAll, queryFirst } from '~/server/db'
import { ALL_VERTICALS, type SiteVertical } from '~/utils/vertical-copy'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { ensureSiteTeam } from '~/server/utils/member-access'

type SetupEnv = Parameters<typeof createSystemSubdomain>[0]

interface SubdomainRow { subdomain: string }
interface UserOrganizationSiteRow {
  organization_id: string
  member_role: string
  site_id: string | null
  onboarding_status: string | null
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

    const { organizationId, existingRetrySiteId } = await resolveCreationOrganization(db, userId, name)
    if (existingRetrySiteId) {
      // A retry (pending/failed site from a previous attempt) may have been created
      // under a stale default (theme_id='saya-theme-v1', vertical='restaurant') —
      // correct both here so a professional-service retry can never be left on Saya.
      await execute(db, `UPDATE sites SET theme_id = ?, vertical = ?, updated_at = ? WHERE id = ?`,
        [themeId, storedVertical, new Date().toISOString(), existingRetrySiteId])
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

async function resolveCreationOrganization(
  db: D1Database,
  userId: string,
  name: string
): Promise<{ organizationId: string; existingRetrySiteId?: string }> {
  const rows = await queryAll<UserOrganizationSiteRow>(db, `
    SELECT
      o.id AS organization_id,
      m.role AS member_role,
      s.id AS site_id,
      s.onboarding_status
    FROM organization o
    JOIN member m ON o.id = m.organizationId
    LEFT JOIN sites s ON s.organization_id = o.id
      WHERE m.userId = ?
    ORDER BY o.createdAt ASC
  `, [userId])

  const orgs = rows ?? []
  const retryOrg = orgs.find(row =>
    row.site_id && (row.onboarding_status === 'pending' || row.onboarding_status === 'failed')
  )
  if (retryOrg?.site_id) {
    return { organizationId: retryOrg.organization_id, existingRetrySiteId: retryOrg.site_id }
  }

  const emptyOwnerOrg = orgs.find(row => !row.site_id && row.member_role === 'owner')
  if (emptyOwnerOrg) {
    await execute(db, `UPDATE organization SET name = ?, slug = ? WHERE id = ?`,
      [name, await uniqueOrganizationSlug(db, name), emptyOwnerOrg.organization_id])
    return { organizationId: emptyOwnerOrg.organization_id }
  }

  // Multi-site: if the user already owns an org with active sites, add the new site there.
  // The unique-per-org constraint was removed pre-squash (was migration 0017); now part of the 0001_initial.sql baseline.
  const existingOwnerOrg = orgs.find(row => row.member_role === 'owner' && row.site_id && row.onboarding_status === 'active')
  if (existingOwnerOrg) {
    return { organizationId: existingOwnerOrg.organization_id }
  }

  return await createOrganizationForSite(db, userId, name)
}

export async function createOrganizationForSite(db: D1Database, userId: string, name: string) {
  const now = Math.floor(Date.now() / 1000)
  const organizationId = `org-${crypto.randomUUID()}`
  const slug = await uniqueOrganizationSlug(db, name)
  await executeBatch(db, [
    {
      query: `INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)`,
      params: [organizationId, name, slug, now],
    },
    {
      query: `INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'owner', ?)`,
      params: [`member-${crypto.randomUUID()}`, organizationId, userId, now],
    },
  ])
  return { organizationId }
}

async function uniqueOrganizationSlug(db: D1Database, name: string) {
  const base = slugifyName(name)
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const existing = await queryFirst<{ id: string }>(db, `SELECT id FROM organization WHERE slug = ? LIMIT 1`, [slug])
    if (!existing) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
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

    // New sites always start free — a paid org does not grant paid entitlements to
    // another site until that site has its own Stripe subscription (see
    // POST /api/billing/site-subscribe for how a site gets upgraded after creation).
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, 'free')

    await execute(db, `UPDATE sites SET onboarding_status = 'active', updated_at = ? WHERE id = ?`, [now, siteId])

    // Surface whether another site in this org is already on a paid plan, so the
    // caller can offer to subscribe this new site too (see POST /api/billing/site-subscribe).
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
