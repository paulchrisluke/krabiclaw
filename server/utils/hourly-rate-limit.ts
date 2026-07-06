import { queryFirst, type DbClient } from '~/server/db'

// Shared defaults for public submission endpoints (contact, reservations,
// experience bookings). Endpoints may override these per their own needs.
export const DEFAULT_IP_HOURLY_LIMIT = 5
export const DEFAULT_EMAIL_DAILY_LIMIT = 3
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

export function getClientIp(event: ApiValue): string {
  const cfIp = getHeader(event, 'CF-Connecting-IP')
  if (cfIp) return cfIp

  const fwd = event.node?.req?.headers?.['x-forwarded-for']
  const forwardedFor = Array.isArray(fwd) ? fwd.join(',') : String(fwd || '')
  return forwardedFor.split(',').map((p: string) => p.trim()).find(Boolean)
    || event.node?.req?.socket?.remoteAddress
    || 'unknown'
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashClientIp(ip: string): Promise<string> {
  if (!ip || ip === 'unknown') return 'unknown'
  return sha256Hex(ip)
}

// Case/whitespace-insensitive hash for identifiers like email addresses, unlike hashClientIp
// which hashes the raw value verbatim (IP addresses don't need case normalization).
export async function hashIdentifier(value: string): Promise<string> {
  const normalized = (value ?? '').toLowerCase().trim()
  if (!normalized) return 'unknown'
  return sha256Hex(normalized)
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
