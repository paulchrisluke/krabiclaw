import { HTTPError } from 'nitro';

import type { H3Event } from 'nitro'
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { recordRequestPhase } from '~/server/utils/request-metrics'
import { resolveMediaImageUrl } from '~/utils/media-image'

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
    logo_url: string | null
    favicon_url: string | null
    hero_image_url: string | null
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
      const row = await queryFirst<PublicBase['site'] & {
        hero_kind: string | null
        hero_public_url: string | null
        hero_thumbnail_url: string | null
      }>(
        db,
        `SELECT s.id, s.organization_id, s.primary_location_id, s.default_currency, s.contact_email, s.contact_phone, s.brand_name, s.vertical,
                s.brand_description, COALESCE(ma_logo.public_url, s.logo_url) AS logo_url,
                json_extract(s.settings, '$.favicon_url') AS favicon_url,
                ma_hero.kind AS hero_kind,
                ma_hero.public_url AS hero_public_url,
                ma_hero.thumbnail_url AS hero_thumbnail_url,
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
           LEFT JOIN media_assets ma_logo ON s.logo_asset_id = ma_logo.id AND ma_logo.status = 'active'
           LEFT JOIN business_locations bl_preview
             ON bl_preview.id = (
               SELECT bl_hero.id
                 FROM business_locations bl_hero
                WHERE bl_hero.organization_id = s.organization_id
                  AND bl_hero.site_id = s.id
                  AND bl_hero.status = 'active'
                ORDER BY CASE
                  WHEN bl_hero.id = s.primary_location_id THEN 0
                  WHEN bl_hero.is_primary = 1 THEN 1
                  ELSE 2
                END, bl_hero.id
                LIMIT 1
             )
           LEFT JOIN media_assets ma_hero
             ON ma_hero.id = bl_preview.hero_media_asset_id
            AND ma_hero.status = 'active'
            AND ma_hero.organization_id = bl_preview.organization_id
            AND ma_hero.site_id = bl_preview.site_id
          WHERE s.id = ? AND s.status = 'active'${options.previewAuthorized ? '' : " AND s.onboarding_status = 'active'"}
          LIMIT 1`,
        [siteId],
      )
      if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
      const { hero_kind, hero_public_url, hero_thumbnail_url, ...site } = row
      return {
        site: {
          ...site,
          hero_image_url: resolveMediaImageUrl({
            kind: hero_kind,
            public_url: hero_public_url,
            thumbnail_url: hero_thumbnail_url,
          }),
        },
      }
    } finally {
      recordRequestPhase(event, 'base', startedAt)
    }
  })()
  requestReads.set(key, pending)
  return pending
}
