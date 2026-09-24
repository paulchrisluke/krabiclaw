import { HTTPError } from 'nitro'
import type { H3Event } from 'nitro/h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertRoleAllows } from '~/server/utils/member-access'
import { getAnalyticsReport, type AnalyticsReport } from '~/server/utils/analytics-report'
import { loadOnboardingChecklist } from '~/server/utils/onboarding-checklist'
import { queryAll, type DbClient } from '~/server/db'

export interface OrganizationReviewsSummary {
  total: number
  /** Mean of every approved rating, or null when there are none to average. */
  average: number | null
  /** Count per whole star, 1 through 5. */
  distribution: Array<{ rating: number; count: number }>
  recent: Array<{ id: string; author: string; rating: number; title: string | null; content: string | null; createdAt: string }>
}

/** The tenant's setup progress. */
export interface OrganizationSetupProgress {
  organizationId: string
  label: string
  completed: number
  total: number
  items: Array<{ id: string; label: string; done: boolean }>
}

export interface OrganizationAnalyticsReport {
  organizationId: string
  report: AnalyticsReport
  reviews: OrganizationReviewsSummary
  setup: OrganizationSetupProgress
}

const SETUP_ITEM_LABELS: Record<string, string> = {
  business_info: 'Business details',
  hero_image: 'Hero image',
  core_offering: 'Products or services',
  story: 'Your story',
  post: 'A first post',
}



/**
 * Approved reviews across the sites in scope.
 *
 * Only an overall rating exists on a review, so this reports the average, the
 * per-star distribution and the most recent few. There are no per-category
 * scores to break down; the schema has one `rating` column.
 */
async function loadReviewsSummary(db: DbClient, organizationIds: readonly string[]): Promise<OrganizationReviewsSummary> {
  if (!organizationIds.length) return { total: 0, average: null, distribution: [], recent: [] }
  const placeholders = organizationIds.map(() => '?').join(', ')
  const rows = await queryAll<{ id: string; author_name: string | null; rating: number; title: string | null; content: string | null; created_at: string }>(
    db,
    `SELECT id, author_name, rating, title, content, created_at
       FROM reviews
      WHERE organization_id IN (${placeholders}) AND status = 'approved'
      ORDER BY created_at DESC`,
    [...organizationIds],
  )

  const distribution = [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: rows.filter(row => row.rating === rating).length,
  }))

  return {
    total: rows.length,
    average: rows.length
      ? Math.round((rows.reduce((sum, row) => sum + row.rating, 0) / rows.length) * 100) / 100
      : null,
    distribution,
    recent: rows.slice(0, 8).map(row => ({
      id: row.id,
      author: row.author_name ?? 'Guest',
      rating: row.rating,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
    })),
  }
}

/** The tenant's setup progress. A checklist belongs to one tenant. */
async function loadSetupProgress(
  event: H3Event,
  organization: { id: string; label: string },
): Promise<OrganizationSetupProgress> {
  const checklist = await loadOnboardingChecklist(event, organization.id)
  const items = Object.entries(checklist.items).map(([id, done]) => ({
    id,
    label: SETUP_ITEM_LABELS[id] ?? id,
    done: Boolean(done),
  }))
  return {
    organizationId: organization.id,
    label: organization.label,
    completed: items.filter(item => item.done).length,
    total: items.length,
    items,
  }
}

/**
 * Analytics for the tenant.
 *
 * This used to report across every site in the organization and combine them,
 * with a filter to pick one. A business is its organization, so there is one
 * report and nothing to combine or choose between.
 */
export async function loadDashboardOrganizationAnalytics(
  event: H3Event,
  query: { startDate?: string; endDate?: string },
): Promise<OrganizationAnalyticsReport> {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 500, statusMessage: 'Database not available' })
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })

  const context = await getDashboardContext(event, {})
  const organization = context.organization
  if (!organization) throw new HTTPError({ statusCode: 403, statusMessage: 'Organization access required' })

  await assertRoleAllows({ organizationId: organization.id, role: organization.role, permissions: { analytics: ['read'] } })

  const [report, reviews, setup] = await Promise.all([
    getAnalyticsReport(db, {
      organizationId: organization.id,
      startDate: query.startDate,
      endDate: query.endDate,
    }),
    loadReviewsSummary(db, [organization.id]),
    loadSetupProgress(event, { id: organization.id, label: organization.name }),
  ])

  return { organizationId: organization.id, report, reviews, setup }
}
