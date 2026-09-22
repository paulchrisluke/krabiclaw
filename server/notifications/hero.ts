import type { DbClient } from '~/server/db'
import { getMediaPlacements } from '~/server/utils/media-placement'
import { mediaStillUrl } from '~/shared/media-placement-contract'

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

async function firstPlacement(
  db: DbClient,
  input: { organizationId: string; ownerType: 'product' | 'business_location'; ownerId: string; slot: string },
): Promise<HeroImage | null> {
  const placements = await getMediaPlacements(db, {
    organizationId: input.organizationId,
    ownerType: input.ownerType,
    ownerIds: [input.ownerId],
    slot: input.slot,
  })
  const item = placements.get(input.ownerId)?.[0]
  // An email shows a picture. A video's picture is its poster: handing the
  // `.mp4` in `public_url` to an `<img>` is what sent a broken hero to guests.
  const imageUrl = mediaStillUrl(item)
  if (!imageUrl) return null
  return { imageUrl, alt: item?.alt_text ?? '' }
}

/** An experience's cover. */
export async function productHero(db: DbClient, organizationId: string, productId: string | null | undefined): Promise<HeroImage | null> {
  if (!productId) return null
  return firstPlacement(db, { organizationId, ownerType: 'product', ownerId: productId, slot: 'image' })
}

/** A location's hero, for a reservation with no product of its own. */
export async function locationHero(db: DbClient, organizationId: string, locationId: string | null | undefined): Promise<HeroImage | null> {
  if (!locationId) return null
  return firstPlacement(db, { organizationId, ownerType: 'business_location', ownerId: locationId, slot: 'hero' })
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
