import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasSiteEntitlement } from '~/server/utils/billing'
import type { TranslationInventoryStatus } from '~/server/utils/translation-inventory'
import { listTranslationReviewItems } from '~/server/utils/translation-review'
import { parseScope } from '~/server/utils/translation-helpers'
import { assertSiteWideAccess } from '~/server/utils/member-access'
import { loadMemberSiteRow } from '~/server/utils/location-access'

function parseStatus(value: unknown): TranslationInventoryStatus | 'all' {
  return value === 'missing' || value === 'draft' || value === 'published' || value === 'stale' || value === 'all'
    ? value
    : 'all'
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const query = getQuery(event)
  const locale = typeof query.locale === 'string' ? query.locale : ''
  if (!locale) return jsonResponse({ error: 'locale is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await loadMemberSiteRow(db, siteId, session.user.id)

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  await assertSiteWideAccess(db, { memberId: site.member_id, role: site.member_role, organizationId: site.organization_id, siteId })

  if (!(await hasSiteEntitlement(db, siteId, 'translation'))) {
    return jsonResponse({ error: 'Translation requires a Growth plan or above.' }, { status: 403 })
  }

  try {
    const review = await listTranslationReviewItems(db, site.organization_id, siteId, {
      targetLocale: locale,
      scope: parseScope(query.scope),
      status: parseStatus(query.status),
    })
    return jsonResponse({ success: true, ...review })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to load translations' }, { status: 400 })
  }
})
