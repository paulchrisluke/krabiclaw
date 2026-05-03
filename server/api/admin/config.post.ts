import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../utils/admin-auth'
import { cloudflareEnv, jsonResponse } from '../../utils/api-response'
import { setConfig, deleteConfig, type SiteConfig } from '../../utils/site-config'

const ALLOWED_KEYS: Array<keyof SiteConfig> = [
  'ga4_property_id',
  'search_console_site_url',
  'gbp_location_id',
  'gbp_account_id'
]

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!env.REVIEWS_DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const body = await readBody<{ key: string; value: string | null }>(event)
  if (!ALLOWED_KEYS.includes(body.key as keyof SiteConfig)) {
    return jsonResponse({ error: 'Invalid config key' }, { status: 400 })
  }

  if (!body.value) {
    await deleteConfig(env.REVIEWS_DB, body.key as keyof SiteConfig)
  } else {
    await setConfig(env.REVIEWS_DB, body.key as keyof SiteConfig, body.value)
  }

  return jsonResponse({ ok: true })
})
