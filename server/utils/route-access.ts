// Shared auth-check logic behind GET /api/account/access and GET /api/admin/access,
// reused as-is by middleware/account.ts and middleware/admin.ts's server-side branch
// (per CLAUDE.md's "nested SSR self-fetch loses Cloudflare bindings" rule) so route
// middleware never has to go through useRequestFetch()'s internal self-fetch just to
// answer a question the request event can resolve directly.
import type { H3Event } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

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
  const allowed = isPlatformAdmin(
    { role: (session.user as { role?: string | null }).role ?? null, email: session.user.email ?? null },
    env,
  )
  return { status: 'ok', allowed }
}
