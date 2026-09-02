import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getMediaPlacements } from '~/server/utils/media-placement'
import { ensurePlatformMediaScope } from '~/server/utils/platform-media'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  const denied = await platformPermissionJsonResponse(event, env, { platform: ['media'] })
  if (denied) return denied

  await ensurePlatformMediaScope(env, db)
  const media = (await getMediaPlacements(db, {
    siteId: PLATFORM_SITE_ID,
    ownerType: 'site',
    ownerIds: [PLATFORM_SITE_ID],
    slot: 'social_share',
  })).get(PLATFORM_SITE_ID) ?? []
  return jsonResponse({ asset_id: media[0]?.asset_id ?? null })
})
