// POST /api/dashboard/onboarding/drafts/[draftId]/activate
//
// The draft's site already exists — it was created pending on the first save
// and every save since has written the owner's answers onto it. This makes it
// public: apply the answers one last time, flip onboarding_status to active,
// make the new organization the session's active one, and close the draft.

import { HTTPError, defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { applyOnboardingDraftToSite, ensureOnboardingSite } from '~/server/utils/onboarding-site'
import { activateSite } from '~/server/utils/site-creation'
import { activateSessionOrganization } from '~/server/utils/session-organization'
import { refreshSocialCard } from '~/server/utils/social-card'
import { purgePublicResourceCacheSafe } from '~/server/utils/public-resource-cache'
import { resolveUserOrganization } from '~/server/utils/member-access'
import type { SiteVertical } from '~/utils/vertical-copy'
import { isValidTimezone } from '~/utils/timezone'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const draftId = getRouterParam(event, 'draftId')
  if (!draftId) return jsonResponse({ error: 'Draft id is required' }, { status: 400 })

  const draft = await queryFirst<{
    id: string
    user_id: string
    organization_id: string | null
    name: string
    vertical: SiteVertical
    subdomain_candidate: string
    status: string
    payload_json: string
  }>(db, `
    SELECT id, user_id, organization_id, name, vertical, subdomain_candidate, status, payload_json
    FROM onboarding_drafts
    WHERE id = ?
    LIMIT 1
  `, [draftId])

  if (!draft || draft.user_id !== session.user.id) {
    return jsonResponse({ error: 'Draft not found' }, { status: 404 })
  }

  const payload = parseOnboardingDraftPayload(draft.payload_json)

  // The currency and the timezone are the owner's answers, never defaults.
  // Refuse rather than launching a site whose prices are quoted in an invented
  // currency or whose hours are in an invented zone.
  const defaultCurrency = payload.source.details.currency
  if (!defaultCurrency) {
    return jsonResponse({ error: 'Choose a currency before creating your site.' }, { status: 400 })
  }
  const timezone = payload.source.details.timezone
  if (!isValidTimezone(timezone)) {
    return jsonResponse({ error: 'Choose a valid location timezone before creating your site.' }, { status: 400 })
  }
  if (!draft.subdomain_candidate) {
    return jsonResponse({ error: 'This draft has no site address. Start the draft again.' }, { status: 400 })
  }

  // Claim the draft so two clicks cannot activate the same site twice.
  const claim = await execute(db, `
    UPDATE onboarding_drafts
    SET status = 'committing', updated_at = ?
    WHERE id = ? AND status = 'active'
  `, [new Date().toISOString(), draftId])
  if (claim.meta.changes === 0) {
    return jsonResponse({ error: 'Draft is no longer active (concurrent activation)' }, { status: 409 })
  }

  // Reopening is the only safe answer to a failure before the site is live. A
  // draft left at 'committing' is invisible to everything that matters: resume,
  // discard and the next save all look for an 'active' draft, so the owner can
  // neither continue nor start over while the pending site keeps their address.
  const reopenDraft = () => execute(db,
    `UPDATE onboarding_drafts SET status = 'active', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), draftId])

  let site: Awaited<ReturnType<typeof ensureOnboardingSite>>
  try {
    site = await ensureOnboardingSite(env, db, session.user.id, {
      id: draft.id,
      organization_id: draft.organization_id,
      name: draft.name,
      vertical: draft.vertical,
      subdomain_candidate: draft.subdomain_candidate,
    })
  } catch (error) {
    await reopenDraft()
    throw error
  }
  if ('error' in site) {
    await reopenDraft()
    return jsonResponse({ error: site.error }, { status: site.status })
  }

  const { organizationId, siteId, subdomain } = site.target
  let committed = false

  try {
    const { locationSlug } = await applyOnboardingDraftToSite(env, db, {
      userId: session.user.id,
      target: site.target,
      payload,
      defaultCurrency,
      timezone,
    })
    await activateSite(db, siteId)

    const now = new Date().toISOString()
    await execute(db, `
      UPDATE onboarding_drafts
      SET status = 'committed', committed_site_id = ?, committed_at = ?, updated_at = ?
      WHERE id = ?
    `, [siteId, now, now, draftId])
    committed = true

    // Activation must not fail the launch: the site is live either way, and the
    // dashboard resolves an organization for the session on its next request.
    await activateSessionOrganization(event, env, organizationId).catch((error: unknown) => {
      console.error('onboarding_activate_session_organization_failed', {
        organizationId, error: error instanceof Error ? error.message : String(error),
      })
    })

    // The homepage and its media are live now: generate the site card once so
    // its first real card uses the homepage hero. Deliberately one owner —
    // everything else is picked up by the social-card-backfill task.
    try {
      await refreshSocialCard({ db, env, owner: { owner_type: 'site', owner_id: siteId }, actorId: session.user.id })
    } catch (cardError) {
      console.error('onboarding_activate_site_card_failed', { siteId, error: cardError instanceof Error ? cardError.message : String(cardError) })
    }

    const waitUntil = event.req.runtime?.cloudflare?.context?.waitUntil
    if (typeof waitUntil === 'function') {
      waitUntil.call(event.req.runtime?.cloudflare?.context, purgePublicResourceCacheSafe(env, siteId))
    } else {
      await purgePublicResourceCacheSafe(env, siteId)
    }

    const orgRow = await resolveUserOrganization(env, { userId: session.user.id, organizationId })
    if (!orgRow) throw new HTTPError({ statusCode: 500, statusMessage: 'Activated organization not found' })

    return jsonResponse({
      success: true, siteId, orgSlug: orgRow.slug, siteSlug: subdomain, locationSlug,
    })
  } catch (error) {
    console.error('onboarding_activate_failed', { draftId, siteId, committed, error })
    if (committed) {
      // The site is live and the draft is closed. Only the tail — the social
      // card, the cache purge, the organization read-back — failed, and
      // reopening the draft here would offer to create the site a second time.
      return jsonResponse({
        error: 'Your site is live, but finishing touches failed. Open your dashboard to continue.',
        siteId,
      }, { status: 500 })
    }
    // Still pending: reopen the draft so the owner can try again from where
    // they were rather than losing their answers.
    await reopenDraft()
    return jsonResponse({ error: 'Could not finish creating your site. Please try again.' }, { status: 500 })
  }
})
