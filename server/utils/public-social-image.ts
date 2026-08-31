import type { DbClient } from '~/server/db'
import { readMediaPlacements } from '~/server/utils/media-asset-manager'
import type { MediaPlacementItem } from '~/server/utils/media-placement'
import type { MediaPlacementOwnerType } from '~/shared/media-placement-contract'
import { publicSocialMediaFromPlacements, type PublicSocialMedia as PublicSocialMediaContract } from '~/utils/social-metadata'

export type PublicSocialMedia = PublicSocialMediaContract<MediaPlacementItem>

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
