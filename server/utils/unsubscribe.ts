import { hmacHex, timingSafeEqual } from '~/server/utils/reply-address'
import { getPlatformDomain } from '~/server/utils/dashboard-notification-links'
import { isMandatoryEmailCategory, isNotificationCategory, type NotificationCategory } from '~/shared/notification-categories'

const TOKEN_BYTES = 16

export interface UnsubscribeEnv {
  EMAIL_REPLY_SECRET?: string
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

export interface UnsubscribeTarget {
  userId: string
  category: NotificationCategory
}

/**
 * One-click unsubscribe for a person and a category, signed with the same
 * EMAIL_REPLY_SECRET that authenticates inbound reply addresses and
 * booking-change links. The link carries no session, so the signature is the
 * only thing that proves the request came from a message we sent.
 */
export async function buildUnsubscribeToken(secret: string, target: UnsubscribeTarget): Promise<string> {
  return hmacHex(secret, `unsubscribe:${target.userId}:${target.category}`, TOKEN_BYTES)
}

export async function verifyUnsubscribeToken(secret: string, target: UnsubscribeTarget, token: string): Promise<boolean> {
  const expected = await buildUnsubscribeToken(secret, target)
  return timingSafeEqual(expected, token)
}

/**
 * The two addresses one opt-out needs.
 *
 * `pageUrl` is what a person clicks in the footer: a confirmation page, so a
 * link scanner opening the message cannot unsubscribe them. `oneClickUrl` is
 * what goes in the RFC 8058 List-Unsubscribe header, which a mail client POSTs
 * to directly — so it must address the API, not a page, and must carry the
 * signed target in the query because that POST's body is fixed by the RFC.
 *
 * Null where there is nothing to unsubscribe from: account-security email is
 * not optional, and an environment without the signing secret cannot mint a
 * link that would verify.
 */
export async function buildUnsubscribeUrls(
  env: UnsubscribeEnv,
  target: UnsubscribeTarget,
): Promise<{ pageUrl: string; oneClickUrl: string } | null> {
  if (!env.EMAIL_REPLY_SECRET) return null
  if (isMandatoryEmailCategory(target.category)) return null
  const token = await buildUnsubscribeToken(env.EMAIL_REPLY_SECRET, target)
  const query = new URLSearchParams({ user: target.userId, category: target.category, token }).toString()
  const origin = `https://${getPlatformDomain(env)}`
  return {
    pageUrl: `${origin}/unsubscribe?${query}`,
    oneClickUrl: `${origin}/api/public/notifications/unsubscribe?${query}`,
  }
}

export function parseUnsubscribeTarget(value: unknown): UnsubscribeTarget | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const userId = typeof record.user === 'string' ? record.user.trim() : ''
  const category = record.category
  if (!userId || !isNotificationCategory(category) || isMandatoryEmailCategory(category)) return null
  return { userId, category }
}
