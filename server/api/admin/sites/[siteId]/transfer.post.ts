// POST /api/admin/sites/[siteId]/transfer — initiate a site transfer to a new owner
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

const TOKEN_BYTES = 32
const EXPIRY_DAYS = 7

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) return jsonResponse({ error: 'siteId required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const userId = session.user.id
  const isPlatAdmin = isPlatformOwner(session.user.email, env)

  // Verify caller is platform admin or an owner/admin of this site
  const site = await db
    .prepare(
      isPlatAdmin
        ? `SELECT s.id, s.organization_id, s.brand_name FROM sites s WHERE s.id = ? LIMIT 1`
        : `SELECT s.id, s.organization_id, s.brand_name FROM sites s
           JOIN member m ON m.organizationId = s.organization_id
           WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner', 'admin') LIMIT 1`,
    )
    .bind(...(isPlatAdmin ? [siteId] : [siteId, userId]))
    .first<{ id: string; organization_id: string; brand_name: string | null }>()

  if (!site) return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })

  let body: { email?: string; message?: string }
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, { status: 400 })
  }

  const toEmailRaw = body.email ?? ''
  if (typeof toEmailRaw !== 'string' || toEmailRaw !== toEmailRaw.trim() || toEmailRaw.trim() === '') {
    return jsonResponse({ error: 'A valid recipient email is required (no surrounding whitespace allowed)' }, { status: 400 })
  }
  const toEmail = toEmailRaw.trim().toLowerCase()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(toEmail)) {
    return jsonResponse({ error: 'A valid recipient email is required' }, { status: 400 })
  }

  // First, check if there is an identical pending request already to avoid double-submission
  const existingPending = await db
    .prepare(
      `SELECT id FROM site_transfer_requests
       WHERE site_id = ? AND to_email = ? AND status = 'pending' LIMIT 1`,
    )
    .bind(siteId, toEmail)
    .first<{ id: string }>()

  if (existingPending) {
    return jsonResponse({ error: 'A pending transfer request to this email already exists.' }, { status: 409 })
  }

  const id = crypto.randomUUID()
  const token = generateToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const cancelStmt = db.prepare(
    `UPDATE site_transfer_requests SET status = 'cancelled'
     WHERE site_id = ? AND status = 'pending'`,
  ).bind(siteId)

  const insertStmt = db.prepare(
    `INSERT INTO site_transfer_requests
     (id, site_id, from_organization_id, to_email, token, status, initiated_by_user_id, message, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).bind(
    id,
    siteId,
    site.organization_id,
    toEmail,
    token,
    userId,
    body.message?.trim() ?? null,
    now.toISOString(),
    expiresAt,
  )

  try {
    await db.batch([cancelStmt, insertStmt])
  } catch (err) {
    const dbErr = err as Record<string, unknown>
    const msg = typeof dbErr.message === 'string' ? dbErr.message : ''
    const code = typeof dbErr.code === 'string' ? dbErr.code : ''
    if (msg.includes('UNIQUE') || msg.includes('constraint') || code === 'SQLITE_CONSTRAINT') {
      return jsonResponse({ error: 'A pending transfer request already exists for this site.' }, { status: 409 })
    }
    console.error('Site transfer transaction failed:', err)
    return jsonResponse({ error: 'Failed to initiate site transfer due to a database error.' }, { status: 500 })
  }

  const platformDomain = env.NUXT_PUBLIC_PLATFORM_DOMAIN ?? 'krabiclaw.com'
  const transferUrl = `https://${platformDomain}/transfer/${token}`

  return jsonResponse({
    id,
    token,
    transfer_url: transferUrl,
    to_email: toEmail,
    expires_at: expiresAt,
    site_name: site.brand_name ?? siteId,
  })
})
