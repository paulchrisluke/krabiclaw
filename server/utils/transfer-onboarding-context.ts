import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { loadDashboardContext } from '~/server/utils/dashboard-context-service'
import { getNotificationsSettings } from '~/server/utils/mcp-workflows'

export interface TransferPaymentPendingContext {
  success: true
  state: 'payment_pending'
  transfer_id: string
}

export type TransferOnboardingContext = TransferPaymentPendingContext | {
  success: true
  state: 'accepted'
  organization: { id: string; slug: string } | null
  site: {
    id: string
    brand_name: string | null
    vertical?: string | null
    subdomain: string | null
    effective_plan: string
  }
  locations: Array<{
    id: string
    title: string
    slug: string
    is_primary: number | boolean
    notification_phone: string | null
  }>
  notifications: { whatsapp_phone: string | null; channels: string[] }
}

export async function loadTransferOnboardingContext(
  event: H3Event,
  scope: { orgSlug?: string | null; transferId?: string | null } = {},
) {
  const hasTransferScope = Object.prototype.hasOwnProperty.call(scope, 'transferId')
  const rawTransferId = scope.transferId
  if (hasTransferScope && (
    typeof rawTransferId !== 'string'
    || !rawTransferId.trim()
    || rawTransferId !== rawTransferId.trim()
  )) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'The transfer query parameter is invalid.' })
  }
  const exactTransferId = hasTransferScope ? rawTransferId! : null

  let context = await loadDashboardContext(event, {
    // An exact transfer scope must never fall through to the generic
    // "latest accepted transfer" resolver. The fallback remains only for
    // legacy onboarding URLs that predate transfer-scoped Checkout links.
    afterTransfer: !hasTransferScope,
    orgSlug: scope.orgSlug,
  })

  // Resolve an exact transfer only after the dashboard context has established
  // the requesting user's membership in the URL organization. Both the
  // accepted transfer claimant and the site's current organization are then
  // checked before selecting its subdomain.
  if (exactTransferId && context.organization) {
    const env = cloudflareEnv(event)
    const db = env.DB
    const session = await getAuthSession(event, env)
    if (!db || !session?.user?.id) {
      throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
    }
    const paymentPending = await queryFirst<{ id: string }>(
      db,
      `
        SELECT t.id
          FROM site_transfer_requests t
         WHERE t.id = ?
           AND t.status = 'pending'
           AND t.stripe_checkout_session_id IS NOT NULL
           AND substr(t.stripe_checkout_session_id, 1, 6) != 'claim:'
           AND t.claiming_user_id = ?
           AND t.claiming_organization_id = ?
         LIMIT 1
      `,
      [exactTransferId, session.user.id, context.organization.id],
    )
    if (paymentPending?.id) {
      return {
        success: true as const,
        state: 'payment_pending' as const,
        transfer_id: paymentPending.id,
      }
    }

    const paymentPendingAccepted = await queryFirst<{ id: string }>(
      db,
      `
        SELECT t.id
          FROM site_transfer_requests t
          JOIN sites s ON s.id = t.site_id
         WHERE t.id = ?
           AND t.status = 'accepted'
           AND t.requires_payment = 1
           AND t.payment_completed_at IS NULL
           AND t.accepted_by_user_id = ?
           AND t.claiming_user_id = ?
           AND t.claiming_organization_id = ?
           AND s.organization_id = ?
         LIMIT 1
      `,
      [exactTransferId, session.user.id, session.user.id, context.organization.id, context.organization.id],
    )
    if (paymentPendingAccepted?.id) {
      return {
        success: true as const,
        state: 'payment_pending' as const,
        transfer_id: paymentPendingAccepted.id,
      }
    }

    const transferredSite = await queryFirst<{ id: string }>(
      db,
      `
        SELECT s.id
          FROM site_transfer_requests t
          JOIN sites s ON s.id = t.site_id
         WHERE t.id = ?
           AND t.status = 'accepted'
           AND t.accepted_by_user_id = ?
           AND t.claiming_user_id = ?
           AND t.claiming_organization_id = ?
           AND s.organization_id = ?
         LIMIT 1
      `,
      [exactTransferId, session.user.id, session.user.id, context.organization.id, context.organization.id],
    )
    if (!transferredSite?.id) {
      throw new HTTPError({ statusCode: 404, statusMessage: 'Transferred site not found' })
    }
    context = await loadDashboardContext(event, {
      orgSlug: scope.orgSlug,
      siteId: transferredSite.id,
    })
  }

  // Legacy URLs without a transfer query continue to resolve the most
  // recently accepted site for this explicit organization. New Checkout URLs
  // always include the transfer ID and take the exact branch above.
  if (!context.site && context.organization) {
    const env = cloudflareEnv(event)
    const db = env.DB
    const session = await getAuthSession(event, env)
    if (!db || !session?.user?.id) {
      throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
    }
    const transferredSite = await queryFirst<{ subdomain: string | null }>(
      db,
      `
        SELECT s.subdomain
          FROM site_transfer_requests t
          JOIN sites s ON s.id = t.site_id
         WHERE t.accepted_by_user_id = ?
           AND t.status = 'accepted'
           AND s.organization_id = ?
           AND s.subdomain IS NOT NULL
         ORDER BY t.completed_at DESC, t.created_at DESC
         LIMIT 1
      `,
      [session.user.id, context.organization.id],
    )
    if (transferredSite?.subdomain) {
      context = await loadDashboardContext(event, {
        orgSlug: scope.orgSlug,
        siteSlug: transferredSite.subdomain,
      })
    }
  }

  if (!context.site) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Transferred site not found' })
  }
  const db = cloudflareEnv(event).DB
  if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
  const [locations, notifications] = await Promise.all([
    queryAll<{
      id: string
      title: string
      slug: string
      is_primary: number | boolean
      notification_phone: string | null
    }>(db, `
      SELECT id, title, slug, is_primary, notification_phone
        FROM business_locations
       WHERE organization_id = ? AND site_id = ? AND status = 'active'
       ORDER BY is_primary DESC, title ASC
    `, [context.site.organization_id, context.site.id]),
    getNotificationsSettings(db, context.site.organization_id, context.site.id),
  ])
  return {
    success: true as const,
    state: 'accepted' as const,
    organization: context.organization,
    site: context.site,
    locations: locations.map(location => ({
      ...location,
      is_primary: Boolean(location.is_primary),
    })),
    notifications,
  }
}
