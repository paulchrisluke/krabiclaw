import { createError, getHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { reassignSiteOwnership } from '~/server/utils/site-transfer'
import { execute, queryFirst } from '~/server/db'

const textEncoder = new TextEncoder()

function timingSafeEqualText(a: string, b: string): boolean {
  const left = textEncoder.encode(a)
  const right = textEncoder.encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

export default defineEventHandler(async (event) => {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = getHeader(event, 'x-dev-route-secret') || ''
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const body = await readBody(event).catch(() => ({})) as {
    siteId?: string
    organizationId?: string
  }

  const siteId = String(body.siteId || 'site-pottery-house').trim()
  const targetOrganizationId = String(body.organizationId || 'org-pottery-house').trim()
  if (!siteId || !targetOrganizationId) {
    return jsonResponse({ error: 'siteId and organizationId are required' }, { status: 400 })
  }

  const site = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT id, organization_id
    FROM sites
    WHERE id = ?
    LIMIT 1
  `, [siteId])

  if (!site) {
    return jsonResponse({ error: 'Site not found' }, { status: 404 })
  }

  let reassigned = false
  if (site.organization_id !== targetOrganizationId) {
    await reassignSiteOwnership(db, siteId, site.organization_id, targetOrganizationId)
    reassigned = true
  }

  const deleteResult = await execute(db, `
    DELETE FROM site_transfer_requests
    WHERE site_id = ?
  `, [siteId])

  const updatedSite = await queryFirst<{ id: string; organization_id: string }>(db, `
    SELECT id, organization_id
    FROM sites
    WHERE id = ?
    LIMIT 1
  `, [siteId])

  return jsonResponse({
    ok: true,
    reassigned,
    deleted_transfer_requests: deleteResult.meta?.changes ?? 0,
    site: updatedSite,
  })
})
