import type { DbClient } from '~/server/db'
import { getMediaPlacements, type MediaPlacementItem } from '~/server/utils/media-placement'

/**
 * The picture a notification leads with.
 *
 * An experience booking leads with the experience's own photo and a table
 * reservation with the location's, because that is the thing the guest is
 * actually looking at. Null is a first-class answer: nothing is substituted,
 * and no stock or placeholder image is invented — tenant surfaces render the
 * tenant's own content or none.
 *
 * Placements are site-scoped while the catalog is org-scoped, so the site is
 * required rather than inferred.
 */
export interface HeroImage {
  imageUrl: string
  alt: string
}

export function notificationHeroImageUrl(
  item: Pick<MediaPlacementItem, 'kind' | 'public_url' | 'thumbnail_url'>,
): string | null {
  if (item.kind === 'video') return item.thumbnail_url?.trim() || null
  if (item.kind === 'image') return item.public_url?.trim() || null
  return null
}

async function firstPlacement(
  db: DbClient,
  input: { siteId: string; ownerType: 'product' | 'business_location'; ownerId: string; slot: string },
): Promise<HeroImage | null> {
  const placements = await getMediaPlacements(db, {
    siteId: input.siteId,
    ownerType: input.ownerType,
    ownerIds: [input.ownerId],
    slot: input.slot,
  })
  const item = placements.get(input.ownerId)?.[0]
  if (!item) return null
  const imageUrl = notificationHeroImageUrl(item)
  if (!imageUrl) return null
  return { imageUrl, alt: item.alt_text ?? '' }
}

/** An experience's cover. */
export async function productHero(db: DbClient, siteId: string, productId: string | null | undefined): Promise<HeroImage | null> {
  if (!productId) return null
  return firstPlacement(db, { siteId, ownerType: 'product', ownerId: productId, slot: 'image' })
}

/** A location's hero, for a reservation with no product of its own. */
export async function locationHero(db: DbClient, siteId: string, locationId: string | null | undefined): Promise<HeroImage | null> {
  if (!locationId) return null
  return firstPlacement(db, { siteId, ownerType: 'business_location', ownerId: locationId, slot: 'hero' })
}

/**
 * Never lets a missing picture break a notification. An email that arrives
 * without its hero is a smaller problem than one that does not arrive.
 */
export async function resolveHero(load: () => Promise<HeroImage | null>): Promise<HeroImage | null> {
  try {
    return await load()
  } catch (error) {
    console.error('notification_hero_lookup_failed', { error: error instanceof Error ? error.message : String(error) })
    return null
  }
}
