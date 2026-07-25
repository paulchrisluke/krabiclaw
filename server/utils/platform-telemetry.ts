import { createHmac } from 'node:crypto'

function requireAuthSecret(env: ApiRecord): string {
  const secret = String(env?.BETTER_AUTH_SECRET ?? '').trim()
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required')
  return secret
}

export function anonymizeId(id: string | null | undefined, env: ApiRecord): string {
  const key = requireAuthSecret(env)
  const normalized = id == null ? '__NULLISH__' : String(id)
  return createHmac('sha256', key).update(normalized).digest('hex')
}
