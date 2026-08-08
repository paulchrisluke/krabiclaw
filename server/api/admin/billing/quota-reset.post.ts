import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { getAuthSession } from '~/server/utils/auth'
import {
  applyQuotaAdjustment,
  assertQuotaOperatorSession,
  parseQuotaAdjustmentRequest,
  previewQuotaAdjustment,
  QuotaAdjustmentError,
} from '~/server/utils/quota-adjustment'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) return permissionDenied

  try {
    const session = await getAuthSession(event, env)
    const actor = assertQuotaOperatorSession(session)
    const request = parseQuotaAdjustmentRequest(await readBody<unknown>(event))
    if (request.mode === 'preview') {
      const plan = await previewQuotaAdjustment(db, env.BETTER_AUTH_SECRET, request.input, actor)
      return jsonResponse({ status: 'preview', plan })
    }
    if (!request.expectedStateSha256 || !request.approvalToken) {
      throw new QuotaAdjustmentError('invalid_request', 400, 'Apply requires expectedStateSha256 and approvalToken.')
    }
    const result = await applyQuotaAdjustment(
      db,
      env.BETTER_AUTH_SECRET,
      request.input,
      actor,
      request.expectedStateSha256,
      request.approvalToken,
    )
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof QuotaAdjustmentError) {
      return jsonResponse({ error: error.message, code: error.code }, { status: error.statusCode })
    }
    throw error
  }
})
