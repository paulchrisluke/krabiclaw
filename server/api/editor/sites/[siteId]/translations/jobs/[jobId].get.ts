import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { hasSiteEntitlement } from '~/server/utils/billing'
import { queryAll, queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const jobId = getRouterParam(event, 'jobId')
  if (!siteId || !jobId) return jsonResponse({ error: 'Site ID and job ID are required' }, { status: 400 })

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

  const job = await queryFirst(db, `
    SELECT id, source_locale, target_locale, scope, status, total_items, total_chars,
           estimated_input_tokens, estimated_output_tokens, estimated_credits,
           actual_input_tokens, actual_output_tokens, actual_credits,
           processed_items, failed_items, error, created_by, started_at, finished_at,
           created_at, updated_at
    FROM translation_jobs
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [jobId, site.organization_id, siteId])

  if (!job) return jsonResponse({ error: 'Translation job not found' }, { status: 404 })

  const results = await queryAll(db, `
    SELECT id, entity_type, entity_id, location_id, page, field, source_hash, source_chars, status, error, created_at, updated_at
    FROM translation_job_items
    WHERE job_id = ? AND organization_id = ? AND site_id = ?
    ORDER BY entity_type, page, field
    LIMIT 500
  `, [jobId, site.organization_id, siteId])

  return jsonResponse({ success: true, job, items: results ?? [] })
})
