import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { isDemoOrg } from '~/server/utils/demo'
import { publishTranslationDrafts } from '~/server/utils/translation-inventory'
import { parseScope } from '~/server/utils/translation-helpers'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as { locale?: string; scope?: string }
  if (!body.locale) return jsonResponse({ error: 'locale is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `, [siteId, session.user.id])

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  if (!(await hasSiteEntitlement(db, siteId, 'translation'))) {
    return jsonResponse({ error: 'Translation requires a Growth plan or above.' }, { status: 403 })
  }

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const result = await publishTranslationDrafts(
      db,
      site.organization_id,
      siteId,
      body.locale,
      parseScope(body.scope),
      session.user.id,
    )
    return jsonResponse({ success: true, result })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to publish translations' }, { status: 400 })
  }
})
