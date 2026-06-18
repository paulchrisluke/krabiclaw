// POST /api/dashboard/onboarding/setup-manual
// Create a site from a business name only — no Google Places data required.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event) as { name?: unknown; vertical?: unknown }
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return jsonResponse({ error: 'name is required' }, { status: 400 })

  const vertical = typeof body?.vertical === 'string' && VALID_VERTICALS.includes(body.vertical as never)
    ? (body.vertical as 'restaurant' | 'experience')
    : 'restaurant'

  const dashboard = await getDashboardContext(event, { requireRestaurant: false })
  if (dashboard?.restaurant) {
    return jsonResponse({ error: 'You already have a site. Onboarding is for new sites only.' }, { status: 400 })
  }

  const result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
    name,
    subdomain: slugify(name).slice(0, 40),
    vertical,
  })

  if (result.status !== 200) {
    if (result.status === 409) {
      return jsonResponse({ error: 'A workspace with this name already exists. Try a different name.' }, { status: 409 })
    }
    return jsonResponse({ error: (result.data.error as string) || 'Could not create workspace. Please try again.' }, { status: result.status || 500 })
  }

  const organizationId = result.data.organizationId as string
  const orgRow = await db.prepare(`SELECT slug FROM organization WHERE id = ? LIMIT 1`)
    .bind(organizationId).first<{ slug: string }>()

  return jsonResponse({ success: true, orgSlug: orgRow?.slug ?? null })
})
