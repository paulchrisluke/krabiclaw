// Guest-facing booking history: every customers row already linked to the
// signed-in user across all tenant sites. Structurally separate from the
// dashboard/[orgSlug] API surface — no organization membership is checked or
// required. See docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { listLinkedCustomersForUser } from '~/server/utils/guest-claims'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const customers = await listLinkedCustomersForUser(db, session.user.id)
  return jsonResponse({ customers })
})
