// Core site creation logic shared by POST /api/sites and the legacy
// dashboard/restaurant proxy. Handles org creation/lookup, idempotency,
// subdomain uniqueness, seeding, and Cloudflare subdomain registration.
import { seedNewSite } from '~/server/utils/site-template'
import { createSystemSubdomain } from '~/server/utils/domains'
import { setSiteEntitlementsFromPlan } from '~/server/utils/billing'
import type { SiteVertical } from '~/utils/vertical-copy'

type SetupEnv = Parameters<typeof createSystemSubdomain>[0]

interface SubdomainRow { subdomain: string }
interface UserOrganizationSiteRow {
  organization_id: string
  member_role: string
  site_id: string | null
  onboarding_status: string | null
}

export const VALID_VERTICALS: SiteVertical[] = ['restaurant', 'experience']

export interface SiteCreationResult {
  status: number
  data: Record<string, unknown>
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
    const existingSubdomain = await db.prepare(`
      SELECT id FROM sites WHERE subdomain = ? LIMIT 1
    `).bind(normalizedSubdomain).first<{ id: string }>()
    if (existingSubdomain) {
      return { status: 409, data: { error: 'This subdomain is already taken' } }
    }

    const { organizationId, existingRetrySiteId } = await resolveCreationOrganization(db, userId, name)
    if (existingRetrySiteId) {
      return await performSeeding(env, db, existingRetrySiteId, organizationId, name, vertical, '')
    }

    siteId = crypto.randomUUID()
    try {
      await db.prepare(`
        INSERT INTO sites
          (id, organization_id, theme_id, slug, subdomain, brand_name, status, plan, onboarding_status, created_at, updated_at)
        VALUES (?, ?, 'saya-theme-v1', ?, ?, ?, 'active', 'free', 'pending', ?, ?)
      `).bind(siteId, organizationId, normalizedSubdomain, normalizedSubdomain, name, new Date().toISOString(), new Date().toISOString()).run()
    } catch (siteError) {
      const msg = siteError instanceof Error ? siteError.message : ''
      if (msg.includes('UNIQUE constraint failed')) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
      throw siteError
    }

    return await performSeeding(env, db, siteId, organizationId, name, vertical, normalizedSubdomain)

  } catch (error) {
    console.error('Site creation failed:', error instanceof Error ? error : new Error(String(error)))
    if (siteId) {
      await db.prepare(`UPDATE sites SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`)
        .bind(new Date().toISOString(), siteId).run().catch(() => {})
    }
    return { status: 500, data: { error: 'Failed to create site. Please try again.' } }
  }
}

async function resolveCreationOrganization(
  db: D1Database,
  userId: string,
  name: string
): Promise<{ organizationId: string; existingRetrySiteId?: string }> {
  const rows = await db.prepare(`
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
  `).bind(userId).all<UserOrganizationSiteRow>()

  const orgs = rows.results ?? []
  const retryOrg = orgs.find(row =>
    row.site_id && (row.onboarding_status === 'pending' || row.onboarding_status === 'failed')
  )
  if (retryOrg?.site_id) {
    return { organizationId: retryOrg.organization_id, existingRetrySiteId: retryOrg.site_id }
  }

  const emptyOwnerOrg = orgs.find(row => !row.site_id && row.member_role === 'owner')
  if (emptyOwnerOrg) {
    await db.prepare(`UPDATE organization SET name = ?, slug = ? WHERE id = ?`)
      .bind(name, await uniqueOrganizationSlug(db, name), emptyOwnerOrg.organization_id)
      .run()
    return { organizationId: emptyOwnerOrg.organization_id }
  }

  return await createOrganizationForSite(db, userId, name)
}

async function createOrganizationForSite(db: D1Database, userId: string, name: string) {
  const now = new Date().toISOString()
  const organizationId = `org-${crypto.randomUUID()}`
  await db.batch([
    db.prepare(`
      INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)
    `).bind(organizationId, name, await uniqueOrganizationSlug(db, name), now),
    db.prepare(`
      INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'owner', ?)
    `).bind(`member-${crypto.randomUUID()}`, organizationId, userId, now),
  ])
  return { organizationId }
}

async function uniqueOrganizationSlug(db: D1Database, name: string) {
  const base = slugifyName(name)
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const existing = await db.prepare(`SELECT id FROM organization WHERE slug = ? LIMIT 1`)
      .bind(slug)
      .first<{ id: string }>()
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

    const resolvedSubdomain = subdomain || await db.prepare(
      'SELECT subdomain FROM sites WHERE id = ?'
    ).bind(siteId).first<SubdomainRow>().then(r => r?.subdomain)

    if (!resolvedSubdomain?.trim()) throw new Error(`Missing subdomain for site ${siteId}`)

    await createSystemSubdomain(env, db, siteId, organizationId, resolvedSubdomain)

    const existingBilling = await db.prepare(`
      SELECT sb.plan FROM site_billing sb
      WHERE sb.organization_id = ? AND sb.status != 'canceled'
      ORDER BY sb.updated_at DESC LIMIT 1
    `).bind(organizationId).first<{ plan: string }>()
    await setSiteEntitlementsFromPlan(db, siteId, organizationId, existingBilling?.plan ?? 'free')

    await db.prepare(`UPDATE sites SET onboarding_status = 'active', updated_at = ? WHERE id = ?`)
      .bind(now, siteId).run()

    return { status: 200, data: { siteId, organizationId, subdomain: resolvedSubdomain, message: 'Site created successfully' } }

  } catch (seedError) {
    console.error('Seeding failed:', seedError instanceof Error ? seedError : new Error(String(seedError)))
    await db.prepare(`UPDATE sites SET onboarding_status = 'failed', updated_at = ? WHERE id = ?`)
      .bind(now, siteId).run().catch(() => {})
    throw new Error('Failed to complete required site setup')
  }
}
