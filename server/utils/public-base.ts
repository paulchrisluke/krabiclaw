import { HTTPError } from 'nitro';
import { oncePerRequest } from '~/server/utils/request-scope'

import type { H3Event } from 'nitro'
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { recordRequestPhase } from '~/server/utils/request-metrics'
import type { CurrencyCode } from '~/shared/currencies'
import { publicSocialMediaFromJson, type PublicMediaPlacement } from '~/server/utils/public-social-image'
import type { SocialImageSource } from '~/utils/social-metadata'

export interface PublicBase {
  site: {
    id: string
    organization_id: string
    default_currency: CurrencyCode | null
    contact_email: string | null
    contact_phone: string | null
    brand_name: string | null
    brand_description: string | null
    vertical: string | null
    theme_id: string
    feature_overrides: string | null
    media: PublicMediaPlacement[]
    social_image: SocialImageSource | null
    seo_title: string | null
    seo_description: string | null
    canonical_url: string | null
    robots: string | null
    default_timezone: string | null
    social_facebook_url: string | null
    social_instagram_url: string | null
    social_tiktok_url: string | null
  }
}

export function loadPublicBase(
  event: H3Event,
  organizationId: string,
  options: { previewAuthorized?: boolean } = {},
): Promise<PublicBase> {
  const key = `public-base:${organizationId}:${options.previewAuthorized ? 'preview' : 'public'}`
  return oncePerRequest(event, key, async () => {
    const startedAt = performance.now()
    const db = cloudflareEnv(event).DB
    if (!db) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })
    try {
      const row = await queryFirst<Omit<PublicBase['site'], 'media'> & { media_json: string }>(
        db,
        `SELECT s.id, s.organization_id, s.default_currency, s.contact_email, s.contact_phone, s.brand_name, s.vertical,
                s.theme_id, s.feature_overrides,
                s.brand_description,
                (SELECT json_group_array(json_object(
                  'asset_id', ma.id, 'slot', mp.slot, 'public_url', ma.public_url,
                  'thumbnail_url', ma.thumbnail_url, 'kind', ma.kind
                )) FROM media_placements mp JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
                  WHERE mp.organization_id = s.id AND mp.owner_type = 'organization' AND mp.owner_id = s.id AND mp.status = 'active') AS media_json,
                s.seo_title, s.seo_description, s.canonical_url, s.robots,
                s.social_facebook_url, s.social_instagram_url, s.social_tiktok_url,
                json_extract(s.settings_json, '$.config.default_timezone') AS default_timezone
           FROM organization s
          WHERE s.id = ? AND s.status = 'active'${options.previewAuthorized ? '' : " AND s.onboarding_status = 'active'"}
          LIMIT 1`,
        [organizationId],
      )
      if (!row) throw new HTTPError({ statusCode: 404, statusMessage: 'Site not found' })
      const { media_json: mediaJson, ...site } = row
      return { site: {
        ...site,
        ...publicSocialMediaFromJson(mediaJson),
      } }
    } finally {
      recordRequestPhase(event, 'base', startedAt)
    }
  })
}
