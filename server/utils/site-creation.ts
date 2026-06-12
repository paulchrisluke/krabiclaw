// Core site creation logic shared by POST /api/sites and the legacy
// dashboard/restaurant proxy. Handles org creation/lookup, idempotency,
// subdomain uniqueness, seeding, and Cloudflare subdomain registration.
import { seedNewSite } from '~/server/utils/site-template'
import { createSystemSubdomain } from '~/server/utils/domains'
import type { SiteVertical } from '~/utils/vertical-copy'

type SetupEnv = Parameters<typeof createSystemSubdomain>[0]

interface MemberRoleRow { role: string }
interface SiteCountRow { count: number }
interface SubdomainRow { subdomain: string }

export const VALID_VERTICALS: SiteVertical[] = ['restaurant', 'experience', 'retail', 'wellness', 'service']

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
    const userOrg = await db.prepare(`
      SELECT o.id FROM organization o
      JOIN member m ON o.id = m.organizationId
      WHERE m.userId = ?
      LIMIT 1
    `).bind(userId).first<{ id: string }>()

    let organizationId: string

    if (userOrg) {
      organizationId = userOrg.id

      const memberRole = await db.prepare(
        `SELECT role FROM member WHERE organizationId = ? AND userId = ?`
      ).bind(organizationId, userId).first() as MemberRoleRow | null

      const siteCount = await db.prepare(
        `SELECT COUNT(*) as count FROM sites WHERE organization_id = ?`
      ).bind(organizationId).first() as SiteCountRow | null

      if (memberRole?.role === 'owner' && (siteCount?.count ?? 0) === 0) {
        await db.prepare(`UPDATE organization SET name = ?, slug = ? WHERE id = ?`)
          .bind(name, name.toLowerCase().replace(/[^a-z0-9]/g, '-'), organizationId)
          .run()
      }

      const existingSite = await db.prepare(`
        SELECT id, onboarding_status, subdomain FROM sites WHERE organization_id = ? LIMIT 1
      `).bind(organizationId).first<{ id: string; onboarding_status: string; subdomain: string }>()

      if (existingSite) {
        if (existingSite.onboarding_status === 'active') {
          return { status: 200, data: { siteId: existingSite.id, organizationId, subdomain: existingSite.subdomain, message: 'Site already exists' } }
        }
        if (existingSite.onboarding_status === 'pending' || existingSite.onboarding_status === 'failed') {
          return await performSeeding(env, db, existingSite.id, organizationId, name, vertical, '')
        }
      }

      const otherOrgSite = await db.prepare(`
        SELECT id FROM sites WHERE subdomain = ? AND organization_id != ? LIMIT 1
      `).bind(normalizedSubdomain, organizationId).first()
      if (otherOrgSite) {
        return { status: 409, data: { error: 'This subdomain is already taken' } }
      }
    } else {
      organizationId = `org-${userId}-${Date.now()}`
      try {
        await db.prepare(`
          INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)
        `).bind(organizationId, name, name.toLowerCase().replace(/[^a-z0-9]/g, '-'), new Date().toISOString()).run()
        await db.prepare(`
          INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'owner', ?)
        `).bind(`member-${organizationId}-${userId}-${Date.now()}`, organizationId, userId, new Date().toISOString()).run()
      } catch (orgError) {
        const raceOrg = await db.prepare(`
          SELECT o.id FROM organization o JOIN member m ON o.id = m.organizationId WHERE m.userId = ? LIMIT 1
        `).bind(userId).first<{ id: string }>()
        if (raceOrg) {
          organizationId = raceOrg.id
        } else {
          throw orgError
        }
      }
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
