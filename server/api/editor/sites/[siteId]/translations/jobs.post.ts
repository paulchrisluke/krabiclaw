import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isDemoOrg } from '~/server/utils/demo'
import { createTranslationJob } from '~/server/utils/translation-inventory'
import { processTranslationJobBatch } from '~/server/utils/translation-processor'
import { parseScope } from '~/server/utils/translation-helpers'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'Site ID required' }, { status: 400 })

  const body = await readBody(event) as { locale?: string; scope?: string; includePublished?: boolean }
  if (!body.locale) return jsonResponse({ error: 'locale is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const site = await db.prepare(`
    SELECT s.id, s.organization_id FROM sites s
    JOIN member om ON s.organization_id = om.organizationId
    WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
    LIMIT 1
  `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
  if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
    return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
  }

  try {
    const job = await createTranslationJob(db, site.organization_id, siteId, session.user.id, {
      targetLocale: body.locale,
      scope: parseScope(body.scope),
      includePublished: body.includePublished === true,
    })
    const backgroundRun = processTranslationJobBatch(db, env, site.organization_id, siteId, job.id).catch((error) => {
      console.error('translation_job_background_failed', {
        siteId,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })
    const cfCtx = event.context.cloudflare?.context
    if (cfCtx?.waitUntil) cfCtx.waitUntil(backgroundRun)
    return jsonResponse({ success: true, job })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to create translation job' }, { status: 400 })
  }
})
