/**
 * The old catalog had no cover: every photograph was one undifferentiated list
 * and the grid displayed the first of them. The Product model names the cover
 * — `product:image`, a single-value slot — so the asset that was the cover on
 * the live site becomes the cover here, once, and the rest stay the gallery
 * they were. Choosing by lowest sort_order is this transform reading what the
 * merchant's ordering already said; nothing at runtime picks a cover.
 *
 * Idempotent: a product that already names a cover is left alone. Used by the
 * rebaseline, which derives it, and by promote-product-covers.mjs, which
 * applies it to a database that was already loaded without it.
 */
export const PROMOTE_PRODUCT_COVERS_SQL = `UPDATE media_placements
   SET slot = 'image', sort_order = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE id IN (
   SELECT (SELECT g.id FROM media_placements g
            WHERE g.owner_type = 'product' AND g.slot = 'gallery' AND g.status = 'active'
              AND g.owner_id = owners.owner_id AND g.site_id = owners.site_id
            ORDER BY g.sort_order, g.id LIMIT 1)
     FROM (SELECT DISTINCT owner_id, site_id FROM media_placements
            WHERE owner_type = 'product' AND slot = 'gallery' AND status = 'active') owners
    WHERE NOT EXISTS (SELECT 1 FROM media_placements i
                       WHERE i.owner_type = 'product' AND i.slot = 'image' AND i.status = 'active'
                         AND i.owner_id = owners.owner_id AND i.site_id = owners.site_id))`

/** The gallery a cover was taken out of closes the gap it left. */
export const RENUMBER_PRODUCT_GALLERIES_SQL = `UPDATE media_placements AS m
   SET sort_order = ordered.position, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM (SELECT id, row_number() OVER (PARTITION BY site_id, owner_id ORDER BY sort_order, id) - 1 AS position
          FROM media_placements WHERE owner_type = 'product' AND slot = 'gallery') AS ordered
 WHERE m.id = ordered.id AND m.sort_order <> ordered.position`
