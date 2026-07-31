import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { loadOnboardingChecklist } from '~/server/utils/onboarding-checklist'

export default defineEventHandler(async (event) => {
  try {
    const rawSiteId = getQuery(event).siteId
    const siteId = typeof rawSiteId === 'string' ? rawSiteId : undefined
    return jsonResponse(await loadOnboardingChecklist(event, siteId))
  } catch (error) {
    rethrowHttpError(error)
    console.error('Checklist endpoint error:', error)
    return jsonResponse({ error: 'checklist_error' }, { status: 500 })
  }
})
