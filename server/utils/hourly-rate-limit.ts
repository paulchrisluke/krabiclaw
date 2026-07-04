import { queryFirst, type DbClient } from '~/server/db'

export function getClientIp(event: ApiValue): string {
  const cfIp = getHeader(event, 'CF-Connecting-IP')
  if (cfIp) return cfIp

  const fwd = event.node?.req?.headers?.['x-forwarded-for']
  const forwardedFor = Array.isArray(fwd) ? fwd.join(',') : String(fwd || '')
  return forwardedFor.split(',').map((p: string) => p.trim()).find(Boolean)
    || event.node?.req?.socket?.remoteAddress
    || 'unknown'
}

export async function hashClientIp(ip: string): Promise<string> {
  if (!ip || ip === 'unknown') return 'unknown'
  const bytes = new TextEncoder().encode(ip)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function incrementHourlyRateLimit(
  db: DbClient,
  key: string,
  limit: number,
  expireMs: number,
): Promise<boolean> {
  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + expireMs).toISOString()
  const row = await queryFirst<{ count: number }>(db, `
    INSERT INTO rate_limits (key, count, updated_at, expires_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.expires_at IS NULL OR rate_limits.expires_at <= ? THEN 1
        ELSE rate_limits.count + 1
      END,
      updated_at = excluded.updated_at,
      expires_at = CASE
        WHEN rate_limits.expires_at IS NULL OR rate_limits.expires_at <= ? THEN ?
        ELSE rate_limits.expires_at
      END
    RETURNING count
  `, [key, now, expiresAt, now, now, expiresAt])

  const count = Number(row?.count ?? NaN)
  return Number.isFinite(count) && count <= limit
}
