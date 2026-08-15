import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { getOrgAdapter } from 'better-auth/plugins'
import {
  applyHistoricalUsageReconciliation,
  assertHistoricalUsageReconciliationOperatorSession,
  HistoricalUsageReconciliationError,
  parseHistoricalUsageReconciliationRequest,
  previewHistoricalUsageReconciliation,
} from '~/server/utils/historical-usage-reconciliation'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) return permissionDenied

  try {
    const session = await getAuthSession(event, env)
    const actor = assertHistoricalUsageReconciliationOperatorSession(session)
    const request = parseHistoricalUsageReconciliationRequest(await readBody<unknown>(event))
    const auth = createAuth(env)
    const authContext = await auth.$context
    const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
    const organization = await organizationAdapter.findOrganizationById(request.input.organizationId)
    if (!organization) {
      throw new HistoricalUsageReconciliationError('organization_not_found', 404, 'Organization not found.')
    }
    if (request.mode === 'preview') {
      const plan = await previewHistoricalUsageReconciliation(db, env.BETTER_AUTH_SECRET, request.input, actor)
      return jsonResponse({ status: 'preview', plan })
    }
    if (!request.expectedStateSha256 || !request.approvalToken) {
      throw new HistoricalUsageReconciliationError('invalid_request', 400, 'Apply requires expectedStateSha256 and approvalToken.')
    }
    const result = await applyHistoricalUsageReconciliation(
      db,
      env.BETTER_AUTH_SECRET,
      request.input,
      actor,
      request.expectedStateSha256,
      request.approvalToken,
    )
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof HistoricalUsageReconciliationError) {
      return jsonResponse({ error: error.message, code: error.code }, { status: error.statusCode })
    }
    throw error
  }
})
import { defineEventHandler } from 'h3'
import { readBody } from 'h3'
