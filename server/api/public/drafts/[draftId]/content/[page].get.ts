import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { parseOnboardingDraftPayload } from '~/server/utils/onboarding-drafts'
import { verifyScopedPreviewToken } from '~/server/utils/preview-token'

export default defineEventHandler(async (event) => {
  const draftId = String(getRouterParam(event, 'draftId') || '').trim()
  const page = String(getRouterParam(event, 'page') || '').trim()
  if (!draftId || !page) return jsonResponse({ error: 'Draft id and page are required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })

  const query = getQuery(event)
  const rawToken = typeof query.token === 'string' ? query.token : null
  if (!rawToken || !env.PREVIEW_SECRET) {
    return jsonResponse({ error: 'Preview token required' }, { status: 401 })
  }

  const isPreviewAuthorized = await verifyScopedPreviewToken(String(env.PREVIEW_SECRET), 'draft', draftId, rawToken)
  if (!isPreviewAuthorized) return jsonResponse({ error: 'Preview token invalid' }, { status: 403 })

  const row = await queryFirst<{ payload_json: string }>(db, `
    SELECT payload_json
    FROM onboarding_drafts
    WHERE id = ? AND status = 'active'
    LIMIT 1
  `, [draftId])

  if (!row) return jsonResponse({ error: 'Draft not found' }, { status: 404 })

  const payload = parseOnboardingDraftPayload(row.payload_json)
  const content = payload.preview.content.filter((item) => item.page === page)
  return jsonResponse({ content })
})
