import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { recordRequestPhase } from '~/server/utils/request-metrics'

export interface PublicBase {
  site: {
    id: string
    organization_id: string
    primary_location_id: string | null
    default_currency: string | null
    contact_email: string | null
    contact_phone: string | null
    brand_name: string | null
    brand_description: string | null
    vertical: string | null
    media: Array<{ asset_id: string; slot: string; public_url: string | null; thumbnail_url: string | null; kind: string | null }>
    seo_title: string | null
    seo_description: string | null
    canonical_url: string | null
    robots: string | null
    source_locale: string | null
    default_timezone: string | null
    social_facebook_url: string | null
    social_instagram_url: string | null
    social_tiktok_url: string | null
  }
}

const readsByRequest = new WeakMap<H3Event, Map<string, Promise<PublicBase>>>()

export function loadPublicBase(
  event: H3Event,
  siteId: string,
  options: { previewAuthorized?: boolean } = {},
): Promise<PublicBase> {
  let requestReads = readsByRequest.get(event)
  if (!requestReads) {
    requestReads = new Map()
    readsByRequest.set(event, requestReads)
  }
  const key = `${siteId}:${options.previewAuthorized ? 'preview' : 'public'}`
  const existing = requestReads.get(key)
  if (existing) return existing

  const pending = (async () => {
    const startedAt = performance.now()
    const db = cloudflareEnv(event).DB
    if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
    try {
      const row = await queryFirst<Omit<PublicBase['site'], 'media'> & { media_json: string }>(
        db,
        `SELECT s.id, s.organization_id, s.primary_location_id, s.default_currency, s.contact_email, s.contact_phone, s.brand_name, s.vertical,
                s.brand_description,
                (SELECT json_group_array(json_object(
                  'asset_id', ma.id, 'slot', mp.slot, 'public_url', ma.public_url,
                  'thumbnail_url', ma.thumbnail_url, 'kind', ma.kind
                )) FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
                  WHERE mp.site_id = s.id AND mp.owner_type = 'site' AND mp.owner_id = s.id AND mp.status = 'active') AS media_json,
                s.seo_title, s.seo_description, s.canonical_url, s.robots,
                s.social_facebook_url, s.social_instagram_url, s.social_tiktok_url,
                (SELECT sl.locale
                   FROM site_locales sl
                  WHERE sl.organization_id = s.organization_id
                    AND sl.site_id = s.id
                    AND sl.is_source = 1
                  LIMIT 1) AS source_locale,
                (SELECT sc.value
                   FROM site_config sc
                  WHERE sc.organization_id = s.organization_id
                    AND sc.site_id = s.id
                    AND sc.key = 'default_timezone'
                  LIMIT 1) AS default_timezone
           FROM sites s
          WHERE s.id = ? AND s.status = 'active'${options.previewAuthorized ? '' : " AND s.onboarding_status = 'active'"}
          LIMIT 1`,
        [siteId],
      )
      if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
      const { media_json: mediaJson, ...site } = row
      return { site: { ...site, media: JSON.parse(mediaJson || '[]') } }
    } finally {
      recordRequestPhase(event, 'base', startedAt)
    }
  })()
  requestReads.set(key, pending)
  return pending
}
