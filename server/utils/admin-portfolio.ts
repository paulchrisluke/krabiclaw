import type { DbClient } from '~/server/db'
import { queryAll, queryFirst } from '~/server/db'

export interface AdminPortfolioOrganization {
  id: string
  name: string
  slug: string | null
  createdAt: string
  siteCount: number
  locationCount: number
  memberCount: number
  pageViews30d: number
  sessions30d: number
  previousPageViews30d: number
}

export interface AdminPortfolioSite {
  id: string
  organizationId: string
  slug: string
  brandName: string | null
  subdomain: string | null
  customDomain: string | null
  status: string | null
  plan: string | null
  vertical: string | null
  locationCount: number
  pageViews30d: number
  sessions30d: number
  previousPageViews30d: number
}

export interface AdminPortfolioLocation {
  id: string
  siteId: string
  slug: string
  title: string
  city: string | null
  status: string | null
  isPrimary: boolean
  rating: number | null
  reviewCount: number
}

interface OrganizationRow {
  id: string
  name: string
  slug: string | null
  created_at: string
  site_count: number
  location_count: number
  member_count: number
  page_views_30d: number
  sessions_30d: number
  previous_page_views_30d: number
}

interface SiteRow {
  id: string
  organization_id: string
  slug: string
  brand_name: string | null
  subdomain: string | null
  custom_domain: string | null
  status: string | null
  plan: string | null
  vertical: string | null
  location_count: number
  page_views_30d: number
  sessions_30d: number
  previous_page_views_30d: number
}

interface LocationRow {
  id: string
  site_id: string
  slug: string
  title: string
  city: string | null
  status: string | null
  is_primary: number
  rating: number | null
  review_count: number | null
}

const analyticsCtes = `
  WITH current_analytics AS (
    SELECT site_id, SUM(page_views) AS page_views, SUM(unique_sessions) AS sessions
    FROM site_analytics_daily
    WHERE date >= date('now', '-29 days')
    GROUP BY site_id
  ),
  previous_analytics AS (
    SELECT site_id, SUM(page_views) AS page_views
    FROM site_analytics_daily
    WHERE date >= date('now', '-59 days') AND date < date('now', '-29 days')
    GROUP BY site_id
  ),
  location_counts AS (
    SELECT site_id, COUNT(*) AS location_count
    FROM business_locations
    GROUP BY site_id
  )
`

function mapOrganization(row: OrganizationRow): AdminPortfolioOrganization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    siteCount: Number(row.site_count || 0),
    locationCount: Number(row.location_count || 0),
    memberCount: Number(row.member_count || 0),
    pageViews30d: Number(row.page_views_30d || 0),
    sessions30d: Number(row.sessions_30d || 0),
    previousPageViews30d: Number(row.previous_page_views_30d || 0),
  }
}

function mapSite(row: SiteRow): AdminPortfolioSite {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    brandName: row.brand_name,
    subdomain: row.subdomain,
    customDomain: row.custom_domain,
    status: row.status,
    plan: row.plan,
    vertical: row.vertical,
    locationCount: Number(row.location_count || 0),
    pageViews30d: Number(row.page_views_30d || 0),
    sessions30d: Number(row.sessions_30d || 0),
    previousPageViews30d: Number(row.previous_page_views_30d || 0),
  }
}

export async function listAdminPortfolioOrganizations(db: DbClient): Promise<AdminPortfolioOrganization[]> {
  const rows = await queryAll<OrganizationRow>(db, `
    ${analyticsCtes},
    site_rollup AS (
      SELECT
        s.organization_id,
        COUNT(*) AS site_count,
        SUM(COALESCE(lc.location_count, 0)) AS location_count,
        SUM(COALESCE(ca.page_views, 0)) AS page_views_30d,
        SUM(COALESCE(ca.sessions, 0)) AS sessions_30d,
        SUM(COALESCE(pa.page_views, 0)) AS previous_page_views_30d
      FROM sites s
      LEFT JOIN location_counts lc ON lc.site_id = s.id
      LEFT JOIN current_analytics ca ON ca.site_id = s.id
      LEFT JOIN previous_analytics pa ON pa.site_id = s.id
      GROUP BY s.organization_id
    ),
    member_counts AS (
      SELECT organizationId, COUNT(*) AS member_count
      FROM member
      GROUP BY organizationId
    )
    SELECT
      o.id,
      o.name,
      o.slug,
      o.createdAt AS created_at,
      COALESCE(sr.site_count, 0) AS site_count,
      COALESCE(sr.location_count, 0) AS location_count,
      COALESCE(mc.member_count, 0) AS member_count,
      COALESCE(sr.page_views_30d, 0) AS page_views_30d,
      COALESCE(sr.sessions_30d, 0) AS sessions_30d,
      COALESCE(sr.previous_page_views_30d, 0) AS previous_page_views_30d
    FROM organization o
    LEFT JOIN site_rollup sr ON sr.organization_id = o.id
    LEFT JOIN member_counts mc ON mc.organizationId = o.id
    ORDER BY page_views_30d DESC, o.name ASC
  `)
  return rows.map(mapOrganization)
}

export async function getAdminPortfolioOrganization(db: DbClient, organizationId: string) {
  const organization = await queryFirst<{ id: string; name: string; slug: string | null; created_at: string }>(db, `
    SELECT id, name, slug, createdAt AS created_at
    FROM organization
    WHERE id = ?
    LIMIT 1
  `, [organizationId])
  if (!organization) return null

  const rows = await queryAll<SiteRow>(db, `
    ${analyticsCtes}
    SELECT
      s.id,
      s.organization_id,
      s.slug,
      s.brand_name,
      s.subdomain,
      s.custom_domain,
      s.status,
      COALESCE(sb.plan, s.plan, 'free') AS plan,
      s.vertical,
      COALESCE(lc.location_count, 0) AS location_count,
      COALESCE(ca.page_views, 0) AS page_views_30d,
      COALESCE(ca.sessions, 0) AS sessions_30d,
      COALESCE(pa.page_views, 0) AS previous_page_views_30d
    FROM sites s
    LEFT JOIN site_billing sb ON sb.site_id = s.id
    LEFT JOIN location_counts lc ON lc.site_id = s.id
    LEFT JOIN current_analytics ca ON ca.site_id = s.id
    LEFT JOIN previous_analytics pa ON pa.site_id = s.id
    WHERE s.organization_id = ?
    ORDER BY page_views_30d DESC, COALESCE(s.brand_name, s.slug) ASC
  `, [organizationId])

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.created_at,
    },
    sites: rows.map(mapSite),
  }
}

export async function getAdminPortfolioSite(db: DbClient, organizationId: string, siteId: string) {
  const organizationResult = await getAdminPortfolioOrganization(db, organizationId)
  if (!organizationResult) return null
  const site = organizationResult.sites.find(candidate => candidate.id === siteId)
  if (!site) return null

  const rows = await queryAll<LocationRow>(db, `
    SELECT id, site_id, slug, title, city, status, is_primary, rating, review_count
    FROM business_locations
    WHERE organization_id = ? AND site_id = ?
    ORDER BY is_primary DESC, title ASC
  `, [organizationId, siteId])

  return {
    organization: organizationResult.organization,
    site,
    locations: rows.map(row => ({
      id: row.id,
      siteId: row.site_id,
      slug: row.slug,
      title: row.title,
      city: row.city,
      status: row.status,
      isPrimary: Boolean(row.is_primary),
      rating: row.rating === null ? null : Number(row.rating),
      reviewCount: Number(row.review_count || 0),
    } satisfies AdminPortfolioLocation)),
  }
}
