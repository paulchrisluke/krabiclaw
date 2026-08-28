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
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM products
    WHERE site_id = ? ${scope.locationId ? 'AND location_id = ?' : ''} AND is_visible = 1
    LIMIT 1
  `, scope.locationId ? [scope.siteId, scope.locationId] : [scope.siteId])
  return Boolean(row)
}

async function experiencesHasLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM experiences
    WHERE site_id = ? ${scope.locationId ? 'AND location_id = ?' : ''} AND status = 'active'
    LIMIT 1
  `, scope.locationId ? [scope.siteId, scope.locationId] : [scope.siteId])
  return Boolean(row)
}

async function reservationsHasLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM reservation_submissions
    WHERE site_id = ? ${scope.locationId ? 'AND location_id = ?' : ''}
      AND status NOT IN ('cancelled', 'completed') AND date >= ?
    LIMIT 1
  `, scope.locationId ? [scope.siteId, scope.locationId, today] : [scope.siteId, today])
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

async function servicesHasLiveData(db: DbClient, scope: ModuleContentGuardScope): Promise<boolean> {
  const row = await queryFirst<{ id: string }>(db, `
    SELECT id FROM offerings WHERE site_id = ? LIMIT 1
  `, [scope.siteId])
  return Boolean(row)
}

const MODULE_LABELS: Partial<Record<ProductFeature, string>> = {
  products: 'visible Products',
  experiences: 'active experiences',
  reservations: 'upcoming reservations',
  ordering: 'active delivery links',
  services: 'published services',
}

const MODULE_CHECKS: Partial<Record<ProductFeature, (_db: DbClient, _scope: ModuleContentGuardScope) => Promise<boolean>>> = {
  products: productsHaveLiveData,
  experiences: experiencesHasLiveData,
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
