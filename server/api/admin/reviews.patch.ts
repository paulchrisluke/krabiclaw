import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: string; status?: string }
  try {
    body = await readBody(event)
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const id = body.id?.trim()
  const status = body.status?.trim()

  if (!id) return jsonResponse({ error: 'Missing review id.' }, { status: 400 })
  if (!['approved', 'rejected', 'pending'].includes(status ?? '')) {
    return jsonResponse({ error: 'Invalid review status.' }, { status: 400 })
  }

  const result = await env.REVIEWS_DB.prepare(
    `UPDATE reviews
     SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = ?`
  ).bind(status, id).run()

  return jsonResponse({ ok: true, changes: result.meta.changes })
})
