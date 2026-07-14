// Guest-facing booking history: every customers row already linked to the
// signed-in user across all tenant sites. Structurally separate from the
// dashboard/[orgSlug] API surface — no organization membership is checked or
// required. See docs/adr/0017-guest-account-model-separate-from-tenant-org-membership.md.
import { jsonResponse } from '~/server/utils/api-response'
import { resolveLinkedCustomersForEvent } from '~/server/utils/account-surface'

export default defineEventHandler(async (event) => {
  const result = await resolveLinkedCustomersForEvent(event)
  if (result.status === 'db_unavailable') return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (result.status === 'unauthenticated') return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  return jsonResponse({ customers: result.data })
})
