import { queryFirst, type DbClient } from '~/server/db'
import type { ProductFeature } from '~/config/cms-registry'

export interface ModuleContentGuardScope {
  siteId: string
  locationId?: string | null
}

export interface ModuleContentGuardResult {
  blocked: boolean
  reason?: string
}

async function productsHaveLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  // Published to this site, offered at this location, and on sale: the three
  // separate states a customer needs before a Product is live for them.
  const row = await queryFirst<{ id: string }>(db, `
    SELECT p.id FROM products p
    JOIN product_publications pub ON pub.product_id = p.id AND pub.organization_id = p.organization_id
      AND pub.site_id = ? AND pub.published = 1
    ${scope.locationId ? 'JOIN product_locations pl ON pl.product_id = p.id AND pl.organization_id = p.organization_id AND pl.location_id = ? AND pl.published = 1' : ''}
    WHERE p.active = 1
    LIMIT 1
  `, scope.locationId ? [scope.siteId, scope.locationId] : [scope.siteId])
  return Boolean(row)
}

async function reservationsHasLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  // Read from the reservation, which holds the seating and its state; the
  // thread it hangs off holds only the conversation.
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM reservations
    WHERE site_id = ? ${scope.locationId ? 'AND location_id = ?' : ''}
      AND status NOT IN ('cancelled', 'completed')
      AND starts_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    LIMIT 1
  `, scope.locationId ? [scope.siteId, scope.locationId] : [scope.siteId])
  return Boolean(row)
}

async function orderingHasLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM business_locations
    WHERE site_id = ? ${scope.locationId ? 'AND id = ?' : ''}
      AND (grab_url IS NOT NULL OR uber_eats_url IS NOT NULL OR foodpanda_url IS NOT NULL)
    LIMIT 1
  `, scope.locationId ? [scope.siteId, scope.locationId] : [scope.siteId])
  return Boolean(row)
}

/**
 * A service page is the services page or a page beneath it.
 *
 * Its path is the whole definition. A page carries no `status` — the column is
 * required of articles, social posts and Q&A, and every page root on every site
 * has it NULL — so a `status = 'published'` predicate here matched nothing and
 * reported every site as having no services. The onboarding checklist asked the
 * same question through a `metadata_json.recipe` marker that no page carries,
 * and got the same nothing. One question, one predicate.
 */
export const SERVICE_PAGE_SQL = `kind = 'page' AND row_role = 'root' AND (path = '/services' OR path LIKE '/services/%')`

async function servicesHasLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM content_documents WHERE site_id = ? AND ${SERVICE_PAGE_SQL} LIMIT 1
  `, [scope.siteId])
  return Boolean(row)
}

const MODULE_LABELS: Partial<Record<ProductFeature, string>> = {
  products: 'live Products',
  reservations: 'upcoming reservations',
  ordering: 'active delivery links',
  services: 'published services',
}

const MODULE_CHECKS: Partial<Record<ProductFeature, (_db: DbClient, _scope: ModuleContentGuardScope) => Promise<boolean>>> = {
  products: productsHaveLiveData,
  reservations: reservationsHasLiveData,
  ordering: orderingHasLiveData,
  services: servicesHasLiveData,
}

/** Disabling a business module must not silently hide populated content — the location-subset
 *  409 (config/cms-registry.ts / site-settings.ts) only protects capability consistency, not
 *  customer content or bookings. Called before writing a `disabled` delta entry for any module;
 *  a feature with no live-data check (e.g. it isn't a real module, or has no backing table) never
 *  blocks. */
export async function checkModuleHasLiveData(
  db: DbClient,
  scope: ModuleContentGuardScope,
  feature: ProductFeature,
): Promise<ModuleContentGuardResult> {
  const check = MODULE_CHECKS[feature]
  if (!check) return { blocked: false }
  const hasLiveData = await check(db, scope)
  if (!hasLiveData) return { blocked: false }
  return {
    blocked: true,
    reason: `Cannot disable ${feature} — this ${scope.locationId ? 'location' : 'site'} has ${MODULE_LABELS[feature] ?? 'existing content'} for it.`,
  }
}
