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
  width?: number | null
  height?: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
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
      || (value.mime_type !== undefined && !nullableString(value.mime_type))
      || (value.width !== undefined && !nullableNumber(value.width))
      || (value.height !== undefined && !nullableNumber(value.height))) {
      throw new Error('Public media payload contains an invalid placement')
    }
    return {
      asset_id: value.asset_id,
      slot: value.slot,
      public_url: value.public_url,
      thumbnail_url: value.thumbnail_url,
      kind: value.kind,
      ...(value.mime_type === undefined ? {} : { mime_type: value.mime_type }),
      ...(value.width === undefined ? {} : { width: value.width }),
      ...(value.height === undefined ? {} : { height: value.height }),
    }
  })
}

/** An organization's own placements, as the tenant row carries them. */
export function organizationSocialMediaFromJson(mediaJson: string) {
  const placements = parsePublicMediaPlacements(mediaJson)
  return publicSocialMediaFromPlacements('organization', placements, placements)
}

export async function loadPublicSocialMedia(
  db: DbClient,
  organizationId: string,
  ownerType: MediaPlacementOwnerType,
  ownerIds: readonly string[],
): Promise<Map<string, PublicSocialMedia>> {
  if (!ownerIds.length) return new Map()
  const uniqueOwnerIds = [...new Set(ownerIds)]
  // The organization's placements are read for its `social_share`, which is
  // the picture of an owner that has none of its own — never its logo.
  const [ownerPlacements, organizationPlacements] = await Promise.all([
    readMediaPlacements(db, { organizationId, ownerType, ownerIds: uniqueOwnerIds }),
    readMediaPlacements(db, { organizationId, ownerType: 'organization', ownerIds: [organizationId] }),
  ])
  const organizationMedia = organizationPlacements.get(organizationId) ?? []
  return new Map(uniqueOwnerIds.map(ownerId => [
    ownerId,
    publicSocialMediaFromPlacements(ownerType, ownerPlacements.get(ownerId) ?? [], organizationMedia),
  ]))
}
