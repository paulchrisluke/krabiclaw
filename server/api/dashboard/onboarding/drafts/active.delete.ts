// DELETE /api/dashboard/onboarding/drafts/active
//
// Abandoning the draft: the owner rewound past the business name, so the
// pending site the first save created is at an address they did not mean to
// claim. Delete it now — nothing was ever public — and close the draft so the
// next save starts a fresh one at the address the new name derives.
//
// The draft closes only once its site and organization are actually gone. A
// success here with the site still standing is what leaves the owner unable to
// re-enter onboarding under the same business name: site creation refuses the
// address as already taken and there is no longer a draft that owns it.

import { defineHandler } from 'nitro'

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { deleteAbandonedDraftTenant } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const draft = await queryFirst<{ id: string; organization_id: string | null; subdomain_candidate: string }>(db, `
    SELECT id, organization_id, subdomain_candidate
    FROM onboarding_drafts
    WHERE user_id = ? AND status = 'active'
    LIMIT 1
  `, [session.user.id])
  if (!draft) return jsonResponse({ success: true, deleted: false })

  let deleted = false
  if (draft.organization_id) {
    const outcome = await deleteAbandonedDraftTenant(env, {
      organizationId: draft.organization_id,
      subdomain: draft.subdomain_candidate,
      userId: session.user.id,
    })
    if ('refused' in outcome) {
      // The draft stays open: it still owns the address, and closing it here
      // would strand the site with nothing left to discard it from.
      if (outcome.refused === 'site_is_live') {
        return jsonResponse({ error: 'This site is already live. Delete it from its dashboard instead.' }, { status: 409 })
      }
      if (outcome.refused === 'not_owner') {
        return jsonResponse({ error: 'Only an owner of this organization can discard its draft site.' }, { status: 403 })
      }
      return jsonResponse({ error: 'Could not discard this draft’s site. Please try again.' }, { status: 500 })
    }
    deleted = outcome.removed !== 'nothing'
  }

  await execute(db, `
    UPDATE onboarding_drafts SET status = 'abandoned', updated_at = ? WHERE id = ? AND status = 'active'
  `, [new Date().toISOString(), draft.id])

  return jsonResponse({ success: true, deleted })
})
