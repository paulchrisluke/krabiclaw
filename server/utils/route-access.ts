// Shared server-side auth-check logic for dashboard middleware and GET
// /api/admin/access. Route middleware calls it directly so nested SSR does not
// self-fetch and lose Cloudflare bindings.
import type { H3Event } from 'nitro'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { requirePlatformEventPermission } from '~/server/utils/platform-admin-users'
import { PLATFORM_ADMIN_ACCESS_PERMISSION } from '~/utils/platform-admin-access'

export type RouteAccessResult =
  | { status: 'unauthenticated' }
  | { status: 'ok', allowed: boolean }

export async function resolveAccountAccessForEvent(event: H3Event): Promise<RouteAccessResult> {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user) return { status: 'unauthenticated' }
  return { status: 'ok', allowed: true }
}

// Distinguishes "no session" (401) from "signed in, not a platform admin" (200,
// allowed: false) — the original response contract this replaces preserved that
// distinction, so the resolver does too rather than collapsing both to one boolean.
export async function resolveAdminAccessForEvent(event: H3Event): Promise<RouteAccessResult> {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user) return { status: 'unauthenticated' }
  let allowed = true
  try {
    await requirePlatformEventPermission(event, env, PLATFORM_ADMIN_ACCESS_PERMISSION)
  } catch {
    allowed = false
  }
  return { status: 'ok', allowed }
}
