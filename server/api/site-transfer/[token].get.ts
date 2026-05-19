// GET /api/site-transfer/[token] — public: fetch transfer details for the accept page
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) return jsonResponse({ error: 'Token required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const row = await db
    .prepare(
      `SELECT r.id, r.site_id, r.to_email, r.status, r.expires_at, r.message,
              s.brand_name, s.slug,
              u.name AS initiated_by_name, u.email AS initiated_by_email
       FROM site_transfer_requests r
       JOIN sites s ON s.id = r.site_id
       JOIN user u ON u.id = r.initiated_by_user_id
       WHERE r.token = ? LIMIT 1`,
    )
    .bind(token)
    .first<{
      id: string
      site_id: string
      to_email: string
      status: string
      expires_at: string
      message: string | null
      brand_name: string | null
      slug: string
      initiated_by_name: string
      initiated_by_email: string
    }>()

  if (!row) return jsonResponse({ error: 'Transfer not found' }, { status: 404 })

  if (row.status !== 'pending') {
    return jsonResponse({ error: 'Transfer is no longer active', status: row.status }, { status: 410 })
  }

  if (new Date(row.expires_at) < new Date()) {
    await db
      .prepare(
        `UPDATE site_transfer_requests SET status = 'expired' WHERE id = ?`,
      )
      .bind(row.id)
      .run()
    return jsonResponse({ error: 'Transfer has expired', status: 'expired' }, { status: 410 })
  }

  return jsonResponse({
    id: row.id,
    site_id: row.site_id,
    site_name: row.brand_name ?? row.slug,
    to_email: row.to_email,
    expires_at: row.expires_at,
    message: row.message,
    initiated_by_name: row.initiated_by_name,
    // Redact the initiating email to just the domain for privacy
    initiated_by_domain: row.initiated_by_email.split('@')[1] ?? '',
  })
})
