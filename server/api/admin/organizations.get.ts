// GET /api/admin/organizations?q=... — search orgs by slug/name for the admin
// invite picker (see pages/admin/index.vue's "invite owner into existing org"
// mode). Backs the case where client:import --apply already provisioned an
// organization/sites/site_domains but has no owner member/invitation yet.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { searchOrganizationsForInvite } from '~/server/utils/admin-org-search'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['organizations'] })
  if (permissionDenied) return permissionDenied

  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''

  const organizations = await searchOrganizationsForInvite(db, q)
  return jsonResponse({ organizations })
})
