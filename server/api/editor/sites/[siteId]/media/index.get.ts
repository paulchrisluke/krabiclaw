// GET /api/editor/sites/[siteId]/media?kind=image&locationId=xxx&limit=50&offset=0
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getMediaAsset, listMediaAssets } from '~/server/utils/media-asset-manager'
import { assertResourceAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)
  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const principal = { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId }
  const query = getQuery(event)
  const id = typeof query.id === 'string' ? query.id : undefined
  const kind = typeof query.kind === 'string' ? query.kind : undefined
  const locationId = typeof query.locationId === 'string' ? query.locationId : undefined
  const search = typeof query.search === 'string' ? query.search : undefined
  const parsedLimit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : Number.NaN
  const parsedOffset = typeof query.offset === 'string' ? Number.parseInt(query.offset, 10) : Number.NaN
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0

  try {
    if (id) {
      const asset = await getMediaAsset(db, id, siteId)
      if (asset) {
        await assertResourceAccess(db, { ...principal, resourceLocationId: asset.location_id ?? null })
      }
      return jsonResponse({ media: asset ? [asset] : [] })
    }

    // No locationId filter means "the whole site's media library" — only
    // site-wide-scoped members may see that; a location-scoped editor must
    // pass locationId explicitly and only ever gets that location's media.
    await assertResourceAccess(db, { ...principal, resourceLocationId: locationId ?? null })

    const assets = await listMediaAssets(db, siteId, { kind, locationId, search, limit, offset })
    return jsonResponse({ media: assets })
  } catch (error) {
    rethrowHttpError(error)
    throw error
  }
})
