import { createHmac } from 'node:crypto'

function requireAuthSecret(env: ApiRecord): string {
  const secret = String(env?.BETTER_AUTH_SECRET ?? '').trim()
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return secret
}

function parseRoleList(role: string | null | undefined): string[] {
  return String(role ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
}

export function hasBetterAuthAdminRole(role: string | null | undefined): boolean {
  return parseRoleList(role).includes('admin')
}

export function isPlatformAdmin(
  user: { role?: string | null; email?: string | null | undefined } | null | undefined,
  _env: ApiRecord,
): boolean {
  if (!user) return false
  return hasBetterAuthAdminRole(user.role)
}

export function requirePlatformAdmin(
  user: { role?: string | null; email?: string | null | undefined } | null | undefined,
  env: ApiRecord,
): void {
  if (!isPlatformAdmin(user, env)) {
    throw new Error('Platform admin access required')
  }
}

export function anonymizeId(id: string | null | undefined, env: ApiRecord): string {
  const key = requireAuthSecret(env)
  const normalized = id == null ? '__NULLISH__' : String(id)
  return createHmac('sha256', key).update(normalized).digest('hex')
}
