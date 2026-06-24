import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createError, getHeader } from 'h3'
import { queryFirst, queryAll } from '~/server/db'

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

  const query = getQuery(event)
  const transferId = String(query.transfer_id || '').trim()
  const token = String(query.token || '').trim()

  if (!transferId && !token) {
    return jsonResponse({ error: 'transfer_id or token is required' }, { status: 400 })
  }

  const transfer = await queryFirst<{ site_id: string }>(db, `
    SELECT *
    FROM site_transfer_requests
    WHERE ${transferId ? 'id = ?' : 'token = ?'}
    LIMIT 1
  `, [transferId || token])

  if (!transfer) return jsonResponse({ transfer: null, site: null, domains: [] })

  const site = await queryFirst(db, `
    SELECT id, organization_id, public_url, custom_domain, custom_domain_status
    FROM sites
    WHERE id = ?
    LIMIT 1
  `, [String(transfer.site_id)])

  const domains = await queryAll(db, `
    SELECT id, organization_id, domain, type, role, status
    FROM site_domains
    WHERE site_id = ?
    ORDER BY type ASC, created_at ASC
  `, [String(transfer.site_id)])

  return jsonResponse({
    transfer,
    site,
    domains: domains ?? [],
  })
})
