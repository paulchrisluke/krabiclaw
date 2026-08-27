import { getQuery } from 'nitro/h3';
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryAll } from '~/server/db'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { findOrganizationById } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['domains'] })
  if (permissionDenied) return permissionDenied

  const query = getQuery(event)
  const search = String(query.q || '').trim().toLowerCase()
  const stuckOnly = String(query.stuck || '') === 'true'
  const params: ApiRecord[] = []
  const where = [`sd.type = 'custom'`, `sd.status != 'deleted'`]

  if (stuckOnly) {
    where.push(`sd.status IN ('pending', 'verifying', 'failed', 'blocked')`)
  }

  // An empty search can rely on the DB limit directly. A non-empty search must load
  // the complete candidate set first, filter in JS (search spans the joined
  // organization name, which SQL can't filter on without another join per row),
  // then truncate to 100 — limiting in SQL first would silently hide real matches
  // that just didn't happen to be the 100 most recently updated rows.
  const domainRows = await queryAll<ApiRecord>(db, `
    SELECT sd.*, s.brand_name AS site_name
    FROM site_domains sd
    JOIN sites s ON s.id = sd.site_id
    WHERE ${where.join(' AND ')}
    ORDER BY sd.status = 'active' ASC, sd.updated_at DESC
    ${search ? '' : 'LIMIT 100'}
  `, params)

  const eventRows = await queryAll<ApiRecord>(db, `
    SELECT e.id, e.event_type, e.message, e.created_at, e.organization_id, sd.domain, s.brand_name AS site_name
    FROM site_domain_events e
    LEFT JOIN site_domains sd ON sd.id = e.domain_id
    JOIN sites s ON s.id = e.site_id
    ORDER BY e.created_at DESC
    ${search ? '' : 'LIMIT 100'}
  `, [])

  const organizationIds = new Set([
    ...domainRows.map(row => String(row.organization_id)),
    ...eventRows.map(row => String(row.organization_id)),
  ])
  const organizations = new Map(await Promise.all([...organizationIds].map(async id => [id, await findOrganizationById(env, id)] as const)))
  const matchesSearch = (row: ApiRecord) => {
    if (!search) return true
    const organization = organizations.get(String(row.organization_id))
    return [row.domain, row.site_name, organization?.name]
      .some(value => typeof value === 'string' && value.toLowerCase().includes(search))
  }
  const enrich = (row: ApiRecord) => ({
    ...row,
    organization_name: organizations.get(String(row.organization_id))?.name ?? null,
  })
  const domains = domainRows.filter(matchesSearch).map(enrich).slice(0, 100)
  const events = eventRows.filter(matchesSearch).map(enrich).slice(0, 100)

  return jsonResponse({ success: true, domains: domains || [], events: events || [] })
})
import { defineHandler } from 'nitro';
