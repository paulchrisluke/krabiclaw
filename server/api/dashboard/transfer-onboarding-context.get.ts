import { jsonResponse } from '~/server/utils/api-response'
import { parseTransferOnboardingQuery } from '~/shared/transfer-onboarding-query'
import { loadTransferOnboardingContext } from '~/server/utils/transfer-onboarding-context'

export default defineEventHandler(async event => {
  const query = getQuery(event)
  const transferScope = parseTransferOnboardingQuery(query)
  if (transferScope.kind === 'invalid') {
    return jsonResponse({ error: transferScope.message }, { status: 400 })
  }
  return jsonResponse(await loadTransferOnboardingContext(event, transferScope.kind === 'exact'
    ? { transferId: transferScope.transferId }
    : {}))
})
import { defineEventHandler } from 'h3'
import { getQuery } from 'h3'
