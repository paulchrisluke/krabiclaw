import { queryFirst } from '~/server/db'
import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { getPublicTenantPageForPath, listCanonicalTenantPages } from '~/server/utils/public-tenant-pages'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return apiErrorResponse(event, 400, 'SITE_ID_REQUIRED', 'Site ID is required')
  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return apiErrorResponse(event, 503, 'DATABASE_UNAVAILABLE', 'Database unavailable')
  // A site that has not finished onboarding is served only to a holder of its
  // preview token, exactly as tenant resolution serves the pages themselves.
  const preview = await resolvePreviewAuthorization(event, siteId, previewSecretOf(env))
  const site = await queryFirst<{ id: string }>(db, `
    SELECT id FROM sites WHERE id = ? AND status = 'active'${preview ? '' : " AND onboarding_status = 'active'"} LIMIT 1
  `, [siteId])
  if (!site) return apiErrorResponse(event, 404, 'SITE_NOT_FOUND', 'Site not found')

  const query = getQuery(event)
  const path = typeof query.path === 'string' ? query.path : null
  const locale = typeof query.locale === 'string' ? query.locale : null

  try {
    const pages = path
      ? await getPublicTenantPageForPath(db, siteId, path, { locale, preview })
      : await listCanonicalTenantPages(db, siteId, locale)
    if (path && !pages) return apiErrorResponse(event, 404, 'PAGE_NOT_FOUND', 'Tenant page not found')
    return jsonResponse({ success: true, page: path ? pages : undefined, pages: path ? undefined : pages, preview })
  } catch (error) {
    const typed = error as { statusCode?: number; statusMessage?: string }
    return apiErrorResponse(event, typed.statusCode ?? 500, 'TENANT_PAGE_LOOKUP_FAILED', typed.statusMessage ?? 'Tenant page lookup failed')
  }
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { getRouterParam } from 'nitro/h3';
