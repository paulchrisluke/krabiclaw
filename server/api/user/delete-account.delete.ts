// DELETE /api/user/delete-account — cancel a scheduled account deletion.
//
// Clears the due instant on the account and on the organizations that were
// scheduled with it, so the deletion-sweep task leaves them alone.

import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { cancelAccountDeletion } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.DB) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  await cancelAccountDeletion(env, session.user.id)
  return jsonResponse({ success: true })
})
import { defineHandler } from 'nitro';
