// GET public site config: scalars every theme reads plus the universal announcement.
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getConfig } from '~/server/utils/organization-config'
import { defineHandler } from 'nitro'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const organization = await queryFirst<{
    id: string
    default_currency: string
    announcement_json: string | null
    announcement_public_url: string | null
  }>(db, `
    SELECT o.id, o.default_currency,
           json_extract(o.settings_json, '$.config.announcement') AS announcement_json,
           ama.public_url AS announcement_public_url
      FROM organization o
      LEFT JOIN media_placements amp ON amp.organization_id = o.id AND amp.owner_type = 'organization'
        AND amp.owner_id = o.id AND amp.slot = 'announcement' AND amp.sort_order = 0 AND amp.status = 'active'
      LEFT JOIN media_assets ama ON ama.id = amp.asset_id AND ama.status = 'active'
     WHERE o.id = ? AND o.status = 'active' AND o.onboarding_status = 'active'
     LIMIT 1
  `, [organizationId])

  if (!organization) return jsonResponse({ error: 'Organization not found' }, { status: 404 })

  const parsedAnnouncement = organization.announcement_json ? JSON.parse(organization.announcement_json) : null
  const announcement = parsedAnnouncement && parsedAnnouncement.enabled !== false
    ? { ...parsedAnnouncement, image_url: organization.announcement_public_url }
    : null

  const config = { ...await getConfig(db, organization.id), default_currency: organization.default_currency }
  return jsonResponse({ success: true, config, announcement })
})
