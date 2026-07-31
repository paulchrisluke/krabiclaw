import { jsonResponse } from '~/server/utils/api-response'
import { loadTransferOnboardingContext } from '~/server/utils/transfer-onboarding-context'

export default defineEventHandler(async event =>
  jsonResponse(await loadTransferOnboardingContext(event)),
)
