import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { buildTranslationInventory } from '~/server/utils/translation-inventory'
import { parseScope } from '~/server/utils/translation-helpers'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const query = getQuery(event)
  const targetLocale = typeof query.locale === 'string' ? query.locale : ''
  if (!targetLocale) return jsonResponse({ error: 'locale is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `, [siteId, session.user.id])

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  if (!(await hasSiteEntitlement(db, siteId, 'translation'))) {
    return jsonResponse({ error: 'Translation requires a Growth plan or above.' }, { status: 403 })
  }

  try {
    const inventory = await buildTranslationInventory(db, site.organization_id, siteId, {
      targetLocale,
      scope: parseScope(query.scope),
      includePublished: query.includePublished === 'true',
    })
    return jsonResponse({ success: true, ...inventory })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to build translation inventory' }, { status: 400 })
  }
})
