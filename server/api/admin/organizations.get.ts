// GET /api/admin/organizations?q=... — search orgs by slug/name for the admin
// invite picker (see pages/admin/index.vue's "invite owner into existing org"
// mode). Backs the case where client:import --apply already provisioned an
// organization/sites/site_domains but has no owner member/invitation yet.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'
import { searchOrganizationsForInvite } from '~/server/utils/admin-org-search'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''

  const organizations = await searchOrganizationsForInvite(db, q)
  return jsonResponse({ organizations })
})
