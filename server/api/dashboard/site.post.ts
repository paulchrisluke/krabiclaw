// Thin proxy to canonical site creation logic for dashboard callers.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'
import type { SiteVertical } from '~/utils/vertical-copy'
import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const rawName = body.name
  const rawSubdomain = body.subdomain
  if (typeof rawName !== 'string' || typeof rawSubdomain !== 'string') {
    return jsonResponse({ error: 'name and subdomain must be strings' }, { status: 400 })
  }

  const name = rawName.trim()
  const subdomain = rawSubdomain.trim()
  const vertical = body?.vertical as string | undefined

  if (!name || !subdomain) {
    return jsonResponse({ error: 'name and subdomain are required' }, { status: 400 })
  }
  if (!vertical || !VALID_VERTICALS.includes(vertical as SiteVertical)) {
    return jsonResponse({
      error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const result = await runSiteCreation(env, db, session.user.id, {
    name,
    subdomain,
    vertical: vertical as SiteVertical
  })
  return jsonResponse(result.data as ApiValue, { status: result.status })
})
