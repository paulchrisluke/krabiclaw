// GET /api/dashboard/legal/engagement-contracts
//
// Staff engagement-contract listing (LegalOperation 'engagement',
// BlawbyRouteKey 'engagementContractsList' — real U8 route `GET
// /engagement-contracts`, see blawby-client.ts). Read-only: no Origin
// pre-check.

import { apiErrorResponse, rethrowHttpError } from '~/server/utils/api-response'
import { callBlawbyRoute } from '~/server/utils/blawby-client'
import { legalJsonResponse, legalRequestCorrelationId, resolveLegalStaffAccess } from '~/server/utils/legal-access'

interface EngagementContractSummary {
  id: string
  status: string
}

function parseEngagementContractsList(body: unknown): { contracts: EngagementContractSummary[] } | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  const raw = record.contracts
  if (!Array.isArray(raw)) return undefined
  const contracts: EngagementContractSummary[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return undefined
    const row = entry as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.status !== 'string') return undefined
    contracts.push({ id: row.id, status: row.status })
  }
  return { contracts }
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  try {
    const access = await resolveLegalStaffAccess(event, 'engagement', { pathname: '/api/dashboard/legal/engagement-contracts' })

    const result = await callBlawbyRoute(access.env, {
      routeKey: 'engagementContractsList',
      scope: 'legal:engagements',
      method: 'GET',
      identity: { organizationId: access.organizationId, actorId: access.userId, actorKind: 'human' },
      correlationId,
      parseResponse: parseEngagementContractsList,
    })

    return legalJsonResponse(result)
  } catch (error) {
    rethrowHttpError(error)
    return apiErrorResponse(event, 500, 'LEGAL_ENGAGEMENT_LIST_FAILED', 'Failed to load engagement contracts')
  }
})

import { defineHandler } from 'nitro';
