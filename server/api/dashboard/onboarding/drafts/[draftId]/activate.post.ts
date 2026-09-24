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
import { applyOnboardingDraft, ensureOnboardingTarget } from '~/server/utils/onboarding-apply'
import { activateOrganization } from '~/server/utils/organization-provisioning'
import { activateSessionOrganization } from '~/server/utils/session-organization'
import { refreshSocialCard } from '~/server/utils/social-card'
import { purgePublicResourceCacheNow } from '~/server/utils/public-resource-cache'
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

  // Reopening is the only safe answer to a failure before the tenant is live. A
  // draft left at 'committing' is invisible to everything that matters: resume,
  // discard and the next save all look for an 'active' draft, so the owner can
  // neither continue nor start over while the pending tenant keeps their address.
  const reopenDraft = () => execute(db,
    `UPDATE onboarding_drafts SET status = 'active', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), draftId])

  let target: Awaited<ReturnType<typeof ensureOnboardingTarget>>
  try {
    target = await ensureOnboardingTarget(env, db, session.user.id, {
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
  if ('error' in target) {
    await reopenDraft()
    return jsonResponse({ error: target.error }, { status: target.status })
  }

  const { organizationId, subdomain } = target.target
  let committed = false

  try {
    const applied = await applyOnboardingDraft(env, db, {
      userId: session.user.id,
      target: target.target,
      payload,
      defaultCurrency,
      timezone,
    })
    // The tenant is not live yet. A refused answer reopens the draft so the owner
    // can correct it, rather than leaving them on a draft they cannot advance.
    if ('error' in applied) {
      await reopenDraft()
      return jsonResponse({ error: applied.error }, { status: applied.status })
    }
    const { locationSlug } = applied
    await activateOrganization(db, organizationId)

    const now = new Date().toISOString()
    await execute(db, `
      UPDATE onboarding_drafts
      SET status = 'committed', committed_at = ?, updated_at = ?
      WHERE id = ?
    `, [now, now, draftId])
    committed = true

    // The tenant is live from here, so its public cache is purged whichever of
    // the steps before it fails, and a failed purge fails the response rather
    // than a background promise nobody reads.
    try {
      await activateSessionOrganization(event, env, organizationId)

      // The homepage and its media are live now: generate the social card once so
      // its first real card uses the homepage hero. Deliberately one owner —
      // everything else is picked up by the social-card-backfill task.
      await refreshSocialCard({ db, env, owner: { owner_type: 'organization', owner_id: organizationId }, actorId: session.user.id })
    } finally {
      await purgePublicResourceCacheNow(env, organizationId)
    }

    const orgRow = await resolveUserOrganization(env, { userId: session.user.id, organizationId })
    if (!orgRow) throw new HTTPError({ statusCode: 500, statusMessage: 'Activated organization not found' })

    return jsonResponse({
      success: true, organizationId, orgSlug: orgRow.slug, subdomain, locationSlug,
    })
  } catch (error) {
    console.error('onboarding_activate_failed', { draftId, organizationId, committed, error })
    if (committed) {
      // The tenant is live and the draft is closed. Only the tail — the social
      // card, the cache purge, the organization read-back — failed, and
      // reopening the draft here would offer to provision it a second time.
      return jsonResponse({
        error: 'Your site is live, but finishing touches failed. Open your dashboard to continue.',
        organizationId,
      }, { status: 500 })
    }
    // Still pending: reopen the draft so the owner can try again from where
    // they were rather than losing their answers.
    await reopenDraft()
    return jsonResponse({ error: 'Could not finish creating your site. Please try again.' }, { status: 500 })
  }
})
