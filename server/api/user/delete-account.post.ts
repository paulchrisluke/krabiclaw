// POST /api/user/delete-account — permanently delete this account after the
// dashboard's explicit destructive confirmation.

import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteAccountNow } from '~/server/utils/tenant-deletion'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.DB) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  try {
    await deleteAccountNow(env, session.user.id)
    return jsonResponse({ success: true })
  } catch (error) {
    const deletionError = error as Error & { code?: string }
    if (deletionError.code === 'sole_owner_with_members') {
      return jsonResponse({
        error: 'sole_owner_with_members',
        message: 'Transfer ownership of organizations with other members before deleting your account.',
      }, { status: 409 })
    }
    throw error
  }
})
import { defineHandler } from 'nitro';
