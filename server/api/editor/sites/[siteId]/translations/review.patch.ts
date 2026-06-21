import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { isDemoOrg } from '~/server/utils/demo'
import type { TranslationEntityType } from '~/server/utils/translation-inventory'
import { saveTranslationReviewItem } from '~/server/utils/translation-review'
import { parseScope } from '~/server/utils/translation-helpers'

function parseEntityType(value: unknown): TranslationEntityType | null {
  return value === 'site_content' || value === 'menu' || value === 'menu_item' || value === 'business_location' || value === 'post'
    ? value
    : null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as {
    locale?: string
    scope?: string
    entity_type?: string
    entity_id?: string
    field?: string
    fields?: Record<string, unknown>
  }
  if (!body.locale) return jsonResponse({ error: 'locale is required' }, { status: 400 })
  const entityType = parseEntityType(body.entity_type)
  if (!entityType || !body.entity_id || !body.field || !body.fields) {
    return jsonResponse({ error: 'entity_type, entity_id, field, and fields are required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  if (!(await hasSiteEntitlement(db, siteId, 'translation'))) {
    return jsonResponse({ error: 'Translation requires a Growth plan or above.' }, { status: 403 })
  }

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const result = await saveTranslationReviewItem(db, site.organization_id, siteId, {
      targetLocale: body.locale,
      scope: parseScope(body.scope),
      entityType,
      entityId: body.entity_id,
      field: body.field,
      fields: body.fields,
    })
    return jsonResponse({ success: true, item: result })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to save translation' }, { status: 400 })
  }
})
