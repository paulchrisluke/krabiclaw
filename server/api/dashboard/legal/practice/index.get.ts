// GET /api/dashboard/legal/practice
//
// Staff practice-profile read (LegalOperation 'practice_read', BlawbyRouteKey
// 'practiceRead' — real U8 route `GET /practice/details`, see
// blawby-client.ts). Read-only: no Origin pre-check (R26 only requires it
// for cookie-authenticated mutations).

import { rethrowHttpError, apiErrorResponse } from '~/server/utils/api-response'
import { callBlawbyRoute } from '~/server/utils/blawby-client'
import { legalJsonResponse, legalRequestCorrelationId, resolveLegalStaffAccess } from '~/server/utils/legal-access'

interface PracticeProfile {
  name: string
  description: string | null
}

function parsePracticeProfile(body: unknown): PracticeProfile | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  if (typeof record.name !== 'string') return undefined
  const description = typeof record.description === 'string' ? record.description : null
  return { name: record.name, description }
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  try {
    const access = await resolveLegalStaffAccess(event, 'practice_read', { pathname: '/api/dashboard/legal/practice' })

    const profile = await callBlawbyRoute(access.env, {
      routeKey: 'practiceRead',
      scope: 'legal:practice',
      method: 'GET',
      identity: { organizationId: access.organizationId, actorId: access.userId, actorKind: 'human' },
      correlationId,
      parseResponse: parsePracticeProfile,
    })

    return legalJsonResponse({ profile })
  } catch (error) {
    rethrowHttpError(error)
    return apiErrorResponse(event, 500, 'LEGAL_PRACTICE_READ_FAILED', 'Failed to load the practice profile')
  }
})

import { defineHandler } from 'nitro';
