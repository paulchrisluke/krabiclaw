import { getSourceLocale } from '~/server/utils/organization-locales'
import { cloudflareEnv, jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { previewSecretOf, resolvePreviewAuthorization } from '~/server/utils/preview-token'
import { loadPublicExperienceDetail, publicProductDetailPayload } from '~/server/utils/public-products'
import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { getQuery } from 'nitro/h3'
import { assertExactCanonicalLocale } from '~/server/utils/localization'

export default defineHandler(async (event) => {
  const organizationId = event.context.organizationId as string | null | undefined
  const slug = getRouterParam(event, 'slug')
  if (!organizationId || !slug) return jsonResponse({ error: 'Organization and Experience slugs are required' }, { status: 400 })
  try {
    const env = cloudflareEnv(event)
    const db = env.DB
    if (!db) return jsonResponse({ error: 'Database unavailable' }, { status: 503 })
    const locale = assertExactCanonicalLocale(getQuery(event).locale ?? await getSourceLocale(db, organizationId))
    const previewAuthorized = await resolvePreviewAuthorization(event, organizationId, previewSecretOf(cloudflareEnv(event)))
    const result = await loadPublicExperienceDetail(env, db, organizationId, previewAuthorized, slug, locale, typeof getQuery(event).location_id === 'string' ? getQuery(event).location_id as string : null)
    if (!result) return jsonResponse({ error: 'Experience not found' }, { status: 404 })
    return jsonResponse(await publicProductDetailPayload(db, env, result))
  } catch (error) {
    rethrowHttpError(error)
    console.error('public_experience_detail_failed', { organizationId, slug, error: error instanceof Error ? error.message : String(error) })
    return jsonResponse({ error: 'Failed to load Experience' }, { status: 500 })
  }
})
