// GET public site config
import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getConfig } from '~/server/utils/site-config'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  
  if (!organizationId) return jsonResponse({ error: 'Unknown tenant' }, { status: 404 })

  const env = cloudflareEnv(event)
  const db = env.db
  
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  try {
    const site = await queryFirst<{ id: string; organization_id: string; default_currency: string }>(db, `
      SELECT id, organization_id, default_currency
      FROM organization
      WHERE id = ? AND status = 'active'
      LIMIT 1
    `, [organizationId]) ?? null

    if (!site) {
      return jsonResponse({ error: 'Site not found' }, { status: 404 })
    }

    const config = {
      ...await getConfig(db, site.organization_id, site.id), default_currency: site.default_currency, }
    return jsonResponse({
      success: true, config
    })
  } catch (error) {
    console.error('Failed to get site config:', error)
    return jsonResponse({ error: 'Failed to get site config' }, { status: 500 })
  }
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
