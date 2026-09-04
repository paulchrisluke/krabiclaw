import { cloudflareEnv, jsonResponse, readRequiredBody, rethrowHttpError } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { setSingleMediaPlacement } from '~/server/utils/media-placement'
import { ensurePlatformMediaScope } from '~/server/utils/platform-media'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { PLATFORM_ORGANIZATION_ID, PLATFORM_SITE_ID } from '~/shared/platform-scope'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const denied = await platformPermissionJsonResponse(event, env, { platform: ['media'] })
  if (denied) return denied
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  try {
    const body = await readRequiredBody<{ asset_id?: unknown }>(event)
    if (body.asset_id !== null && (typeof body.asset_id !== 'string' || !body.asset_id.trim())) {
      return jsonResponse({ error: 'asset_id must be a non-empty string or null' }, { status: 400 })
    }
    await ensurePlatformMediaScope(env, db)
    const result = await setSingleMediaPlacement(db, {
      env,
      organizationId: PLATFORM_ORGANIZATION_ID,
      siteId: PLATFORM_SITE_ID,
      placement: { owner_type: 'site', owner_id: PLATFORM_SITE_ID, slot: 'social_share' },
      assetId: typeof body.asset_id === 'string' ? body.asset_id.trim() : null,
    })
    return jsonResponse(result)
  } catch (error) {
    rethrowHttpError(error)
    return jsonResponse({ error: 'Failed to update platform sharing image' }, { status: 500 })
  }
})
