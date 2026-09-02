import type { DbClient } from '~/server/db'
import { readMediaPlacements } from '~/server/utils/media-asset-manager'
import type { MediaPlacementItem } from '~/server/utils/media-placement'
import type { MediaPlacementOwnerType } from '~/shared/media-placement-contract'
import { publicSocialMediaFromPlacements, type PublicSocialMedia as PublicSocialMediaContract } from '~/utils/social-metadata'

export type PublicSocialMedia = PublicSocialMediaContract<MediaPlacementItem>

export interface PublicMediaPlacement {
  asset_id: string
  slot: string
  public_url: string | null
  thumbnail_url: string | null
  kind: string | null
  mime_type?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function parsePublicMediaPlacements(mediaJson: string): PublicMediaPlacement[] {
  const parsed: unknown = JSON.parse(mediaJson || '[]')
  if (!Array.isArray(parsed)) throw new Error('Public media payload must be an array')
  return parsed.map((value) => {
    if (!isRecord(value)
      || typeof value.asset_id !== 'string'
      || typeof value.slot !== 'string'
      || !nullableString(value.public_url)
      || !nullableString(value.thumbnail_url)
      || !nullableString(value.kind)
      || (value.mime_type !== undefined && !nullableString(value.mime_type))) {
      throw new Error('Public media payload contains an invalid placement')
    }
    return {
      asset_id: value.asset_id,
      slot: value.slot,
      public_url: value.public_url,
      thumbnail_url: value.thumbnail_url,
      kind: value.kind,
      ...(value.mime_type === undefined ? {} : { mime_type: value.mime_type }),
    }
  })
}

export function publicSocialMediaFromJson(mediaJson: string) {
  const placements = parsePublicMediaPlacements(mediaJson)
  return publicSocialMediaFromPlacements(placements, placements)
}

export async function loadPublicSocialMedia(
  db: DbClient,
  siteId: string,
  ownerType: MediaPlacementOwnerType,
  ownerIds: readonly string[],
): Promise<Map<string, PublicSocialMedia>> {
  if (!ownerIds.length) return new Map()
  const uniqueOwnerIds = [...new Set(ownerIds)]
  const [ownerPlacements, sitePlacements] = await Promise.all([
    readMediaPlacements(db, { siteId, ownerType, ownerIds: uniqueOwnerIds }),
    ownerType === 'site' && uniqueOwnerIds.length === 1 && uniqueOwnerIds[0] === siteId
      ? Promise.resolve(null)
      : readMediaPlacements(db, { siteId, ownerType: 'site', ownerIds: [siteId] }),
  ])
  const siteMedia = sitePlacements?.get(siteId) ?? ownerPlacements.get(siteId) ?? []
  return new Map(uniqueOwnerIds.map(ownerId => {
    const ownerMedia = ownerPlacements.get(ownerId) ?? []
    return [ownerId, publicSocialMediaFromPlacements(ownerMedia, siteMedia)]
  }))
}
