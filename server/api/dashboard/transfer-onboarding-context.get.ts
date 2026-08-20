import { jsonResponse } from '~/server/utils/api-response'
import { parseTransferOnboardingQuery } from '~/shared/transfer-onboarding-query'
import { loadTransferOnboardingContext } from '~/server/utils/transfer-onboarding-context'

export default defineHandler(async event => {
  const query = getQuery(event)
  const transferScope = parseTransferOnboardingQuery(query)
  if (transferScope.kind === 'invalid') {
    return jsonResponse({ error: transferScope.message }, { status: 400 })
  }
  return jsonResponse(await loadTransferOnboardingContext(event, transferScope.kind === 'exact'
    ? { transferId: transferScope.transferId }
    : {}))
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
