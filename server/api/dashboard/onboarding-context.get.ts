import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { loadDashboardContext } from '~/server/utils/dashboard-context-service'
import { EMPTY_ONBOARDING_CHECKLIST, loadOnboardingChecklist } from '~/server/utils/onboarding-checklist'
import { createPreviewToken } from '~/server/utils/preview-token'

export default defineEventHandler(async (event) => {
  const context = await loadDashboardContext(event, {})
  const siteId = context.site?.id ?? null
  if (!siteId) {
    return jsonResponse({
      success: true,
      context,
      previewToken: null,
      checklist: EMPTY_ONBOARDING_CHECKLIST,
    })
  }

  const env = cloudflareEnv(event)
  if (!env.PREVIEW_SECRET) {
    throw createError({ statusCode: 500, statusMessage: 'PREVIEW_SECRET is required for editor previews' })
  }
  const [previewToken, checklist] = await Promise.all([
    createPreviewToken(String(env.PREVIEW_SECRET), siteId, Date.now() + 60 * 60 * 1000),
    loadOnboardingChecklist(event, siteId),
  ])

  return jsonResponse({
    success: true,
    context,
    previewToken,
    checklist,
  })
})
