import type { Menu, MenuItem, MenuWithItems, CreateMenuRequest, UpdateMenuRequest, CreateMenuItemRequest, UpdateMenuItemRequest } from '../types/menu'
import { normalizePriceAmount } from '~/shared/money'

const MAX_SUFFIX_ATTEMPTS = 50

type SqlBindValue = string | number | boolean | null

interface PublishedMenuTranslation {
  name: string | null
  description: string | null
  section_order: string | null
}

interface PublishedMenuItemTranslation {
  menu_item_id: string
  section: string | null
  name: string | null
  description: string | null
  allergens: string | null
  ingredients: string | null
  dietary_notes: string | null
  preparation: string | null
  serving_note: string | null
}

export class MenuSectionConflictError extends Error {
  code = 'MENU_SECTION_CONFLICT' as const

  constructor(message = 'Section already exists') {
    super(message)
    this.name = 'MenuSectionConflictError'
  }
}

export class MenuSectionNotFoundError extends Error {
  code = 'MENU_SECTION_NOT_FOUND' as const

  constructor(message = 'Section not found') {
    super(message)
    this.name = 'MenuSectionNotFoundError'
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
  
  // Return fallback if slug is empty (e.g., non-ASCII only names)
  if (!slug) {
    return `untitled-${Date.now().toString(36)}`
  }
  
  return slug
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function normalizeSectionOrder(sections: unknown): string[] {
  const source = Array.isArray(sections) ? sections : parseStringArray(sections)
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const section of source) {
    if (typeof section !== 'string') continue
    const trimmed = section.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

function mapMenu(row: Record<string, unknown>): Menu {
  return {
    ...(row as unknown as Menu),
    section_order: normalizeSectionOrder(row.section_order),
  }
}

function mapMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    ...(row as unknown as MenuItem),
    available: Boolean(row.available),
    featured: Boolean(row.featured),
    featured_sort_order: typeof row.featured_sort_order === 'number' ? row.featured_sort_order : Number(row.featured_sort_order ?? 0),
    allergens: parseStringArray(row.allergens),
    ingredients: parseStringArray(row.ingredients),
    dietary_notes: parseStringArray(row.dietary_notes),
  }
}

function sortMenuItems(items: MenuItem[], sectionOrder: string[]): MenuItem[] {
  const sectionIndex = new Map(sectionOrder.map((section, index) => [section, index]))
  return [...items].sort((a, b) => {
    const sectionA = a.section || 'Uncategorized'
    const sectionB = b.section || 'Uncategorized'
    const indexA = sectionIndex.get(sectionA)
    const indexB = sectionIndex.get(sectionB)

    if (indexA !== undefined || indexB !== undefined) {
      if (indexA === undefined) return 1
      if (indexB === undefined) return -1
      if (indexA !== indexB) return indexA - indexB
    } else if (sectionA !== sectionB) {
      return sectionA.localeCompare(sectionB)
    }

    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name)
  })
}

async function applyPublishedMenuTranslations(
  db: D1Database,
  organizationId: string,
  siteId: string,
  menu: MenuWithItems,
  locale?: string,
): Promise<MenuWithItems> {
  if (!locale) return menu

  const menuTranslation = await db.prepare(`
    SELECT name, description, section_order
    FROM menu_translations
    WHERE organization_id = ? AND site_id = ? AND menu_id = ? AND locale = ? AND status = 'published'
    LIMIT 1
  `).bind(organizationId, siteId, menu.id, locale).first<PublishedMenuTranslation>()

  const { results } = await db.prepare(`
    SELECT menu_item_id, section, name, description, allergens, ingredients, dietary_notes, preparation, serving_note
    FROM menu_item_translations
    WHERE organization_id = ? AND site_id = ? AND locale = ? AND status = 'published'
      AND menu_item_id IN (SELECT id FROM menu_items WHERE menu_id = ?)
  `).bind(organizationId, siteId, locale, menu.id).all<PublishedMenuItemTranslation>()

  const itemTranslations = new Map((results ?? []).map(row => [row.menu_item_id, row]))
  const sectionOrder = menuTranslation?.section_order
    ? normalizeSectionOrder(menuTranslation.section_order)
    : menu.section_order ?? []

  const translatedItems = menu.items.map((item) => {
    const translation = itemTranslations.get(item.id)
    if (!translation) return item

    return {
      ...item,
      section: translation.section ?? item.section,
      name: translation.name ?? item.name,
      description: translation.description ?? item.description,
      allergens: translation.allergens !== null ? parseStringArray(translation.allergens) : item.allergens,
      ingredients: translation.ingredients !== null ? parseStringArray(translation.ingredients) : item.ingredients,
      dietary_notes: translation.dietary_notes !== null ? parseStringArray(translation.dietary_notes) : item.dietary_notes,
      preparation: translation.preparation ?? item.preparation,
      serving_note: translation.serving_note ?? item.serving_note,
    }
  })

  return {
    ...menu,
    name: menuTranslation?.name ?? menu.name,
    description: menuTranslation?.description ?? menu.description,
    section_order: sectionOrder,
    items: sortMenuItems(translatedItems, sectionOrder),
  }
}

async function getMenuSectionOrder(db: D1Database, menuId: string): Promise<string[]> {
  const row = await db.prepare('SELECT section_order FROM menus WHERE id = ? LIMIT 1').bind(menuId).first<{ section_order: string | null }>()
  return normalizeSectionOrder(row?.section_order)
}

async function getMenuSectionOrderWithVersion(db: D1Database, menuId: string): Promise<{ sectionOrder: string[], updatedAt: string }> {
  const row = await db.prepare('SELECT section_order, updated_at FROM menus WHERE id = ? LIMIT 1').bind(menuId).first<{ section_order: string | null; updated_at: string }>()
  return {
    sectionOrder: normalizeSectionOrder(row?.section_order),
    updatedAt: row?.updated_at ?? '',
  }
}

async function saveMenuSectionOrder(
  db: D1Database,
  menuId: string,
  sectionOrder: string[],
  updatedBy?: string,
  expectedUpdatedAt?: string
): Promise<boolean> {
  const normalized = normalizeSectionOrder(sectionOrder)
  const now = new Date().toISOString()

  let query = 'UPDATE menus SET section_order = ?, updated_at = ?'
  const params: (string | number | null)[] = [JSON.stringify(normalized), now]

  if (updatedBy) {
    query += ', updated_by = ?'
    params.push(updatedBy)
  }

  query += ' WHERE id = ?'
  params.push(menuId)

  if (expectedUpdatedAt) {
    query += ' AND updated_at = ?'
    params.push(expectedUpdatedAt)
  }

  const result = await db.prepare(query).bind(...params).run()
  if (!result.success) throw new Error('Failed to update menu section order')
  return result.meta.changes > 0
}

async function ensureMenuSectionInOrder(db: D1Database, menuId: string, section: string, updatedBy?: string): Promise<void> {
  const normalizedSection = section.trim()
  if (!normalizedSection) return

  for (let attempt = 0; attempt < 5; attempt++) {
    const { sectionOrder, updatedAt } = await getMenuSectionOrderWithVersion(db, menuId)
    if (sectionOrder.includes(normalizedSection)) return

    const success = await saveMenuSectionOrder(db, menuId, [...sectionOrder, normalizedSection], updatedBy, updatedAt)
    if (success) return
  }
  throw new Error('Failed to ensure menu section order due to concurrent modifications')
}

async function uniqueSlug(db: D1Database, menuId: string, base: string, excludeId?: string): Promise<string> {
  // Get site_id from menuId to ensure site-wide uniqueness for public URLs
  const menu = await db.prepare(`SELECT site_id FROM menus WHERE id = ?`).bind(menuId).first() as { site_id: string } | null
  const siteId = menu?.site_id
  
  if (!siteId) throw new Error('Menu not found for slug generation')

  const baseSlug = slugify(base)
  let candidate = baseSlug
  let suffix = 1
  while (suffix <= MAX_SUFFIX_ATTEMPTS) {
    const query = excludeId
      ? `SELECT mi.id FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.site_id = ? AND mi.slug = ? AND mi.id != ? LIMIT 1`
      : `SELECT mi.id FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.site_id = ? AND mi.slug = ? LIMIT 1`
    const params = excludeId ? [siteId, candidate, excludeId] : [siteId, candidate]
    const existing = await db.prepare(query).bind(...params).first()
    if (!existing) return candidate
    candidate = `${baseSlug}-${suffix}`
    suffix++
  }

  throw new Error(`Failed to generate unique slug for "${base}" after ${MAX_SUFFIX_ATTEMPTS} attempts`)
}

// Get menus for a site with optional location filter
export async function getMenus(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId?: string | null
): Promise<Menu[]> {
  let query = `
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE organization_id = ? AND site_id = ?
  `
  const params: (string | null)[] = [organizationId, siteId]

  if (locationId !== undefined && locationId !== null && locationId !== '') {
    // Include menus for this specific location AND site-wide menus (location_id IS NULL)
    query += ` AND (location_id = ? OR location_id IS NULL)`
    params.push(locationId)
  }

  query += ` ORDER BY location_id IS NULL, (status = 'published') DESC, name`

  const results = await db.prepare(query).bind(...params).all()
  return (results.results || []).map(row => mapMenu(row as Record<string, unknown>))
}

// Get menu with items
export async function getMenuWithItems(
  db: D1Database,
  organizationId: string,
  siteId: string,
  menuId: string
): Promise<MenuWithItems | null> {
  // Get menu
  const menu = await db.prepare(`
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(menuId, organizationId, siteId).first<Record<string, unknown>>()

  if (!menu) return null
  const mappedMenu = mapMenu(menu)

  // Get menu items
  const items = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.menu_id = ?
    ORDER BY mi.sort_order, mi.name
  `).bind(menuId).all()

  return {
    ...mappedMenu,
    items: sortMenuItems((items.results || []).map(mapMenuItem), mappedMenu.section_order ?? [])
  }
}

// Get active menu for a scope (brand or location)
export async function getActiveMenu(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId?: string | null,
  locale?: string
): Promise<MenuWithItems | null> {
  // First try to get location-specific menu
  if (locationId) {
    const locationMenu = await db.prepare(`
      SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
             created_at, updated_at, created_by, updated_by
      FROM menus 
      WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'published'
      LIMIT 1
    `).bind(organizationId, siteId, locationId).first<Record<string, unknown>>()

    if (locationMenu) {
      const mappedMenu = mapMenu(locationMenu)
      const items = await db.prepare(`
        SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
               mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
               mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
               mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
        FROM menu_items mi
        LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
        WHERE mi.menu_id = ?
        ORDER BY mi.sort_order, mi.name
      `).bind(locationMenu.id).all()

      const menuWithItems = {
        ...mappedMenu,
        items: sortMenuItems((items.results || []).map(mapMenuItem), mappedMenu.section_order ?? [])
      }
      return applyPublishedMenuTranslations(db, organizationId, siteId, menuWithItems, locale)
    }
  }

  // Fall back to brand/default menu
  const brandMenu = await db.prepare(`
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE organization_id = ? AND site_id = ? AND location_id IS NULL AND status = 'published'
    LIMIT 1
  `).bind(organizationId, siteId).first<Record<string, unknown>>()

  if (!brandMenu) return null
  const mappedMenu = mapMenu(brandMenu)

  const items = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.menu_id = ?
    ORDER BY mi.sort_order, mi.name
  `).bind(brandMenu.id).all()

  const menuWithItems = {
    ...mappedMenu,
    items: sortMenuItems((items.results || []).map(mapMenuItem), mappedMenu.section_order ?? [])
  }
  return applyPublishedMenuTranslations(db, organizationId, siteId, menuWithItems, locale)
}

// Get public menu item by slug
export async function getPublicMenuItem(
  db: D1Database,
  siteId: string,
  slug: string
): Promise<MenuItem | null> {
  const item = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE m.site_id = ? AND mi.slug = ? AND m.status = 'published'
    LIMIT 1
  `).bind(siteId, slug).first()

  return item ? mapMenuItem(item) : null
}

// Create menu
export async function createMenu(
  db: D1Database,
  organizationId: string,
  siteId: string,
  menu: CreateMenuRequest,
  createdBy: string
): Promise<Menu> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const result = await db.prepare(`
    INSERT INTO menus (id, organization_id, site_id, location_id, name, description, status, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
  `).bind(
    id,
    organizationId,
    siteId,
    menu.locationId || null,
    menu.name,
    menu.description || null,
    now,
    now,
    createdBy
  ).run()

  if (!result.success) {
    throw new Error('Failed to create menu')
  }

  return {
    id,
    organization_id: organizationId,
    site_id: siteId,
    location_id: menu.locationId || null,
    name: menu.name,
    description: menu.description || null,
    status: 'draft',
    created_at: now,
    updated_at: now,
    created_by: createdBy,
    updated_by: null,
    section_order: []
  }
}

// Update menu
export async function updateMenu(
  db: D1Database,
  organizationId: string,
  siteId: string,
  menuId: string,
  updates: UpdateMenuRequest,
  updatedBy: string
): Promise<Menu> {
  const now = new Date().toISOString()
  
  // Build dynamic update query
  const setParts: string[] = []
  const params: SqlBindValue[] = []

  if (updates.name !== undefined) {
    setParts.push('name = ?')
    params.push(updates.name)
  }
  if (updates.description !== undefined) {
    setParts.push('description = ?')
    params.push(updates.description)
  }
  if (updates.status !== undefined) {
    setParts.push('status = ?')
    params.push(updates.status)
  }
  if (updates.section_order !== undefined) {
    setParts.push('section_order = ?')
    params.push(JSON.stringify(normalizeSectionOrder(updates.section_order)))
  }

  setParts.push('updated_at = ?')
  setParts.push('updated_by = ?')
  params.push(now, updatedBy)

  params.push(menuId, organizationId, siteId)

  const result = await db.prepare(`
    UPDATE menus 
    SET ${setParts.join(', ')}
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `).bind(...params).run()

  if (!result.success) {
    throw new Error('Failed to update menu')
  }

  const updatedMenu = await db.prepare(`
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(menuId, organizationId, siteId).first<Record<string, unknown>>()

  if (!updatedMenu) {
    throw new Error('Menu not found after update')
  }

  return mapMenu(updatedMenu)
}

// Delete menu
export async function deleteMenu(
  db: D1Database,
  organizationId: string,
  siteId: string,
  menuId: string
): Promise<void> {
  const result = await db.prepare(`
    DELETE FROM menus 
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `).bind(menuId, organizationId, siteId).run()

  if (!result.success) {
    throw new Error('Failed to delete menu')
  }
}

// Create menu item
export async function createMenuItem(
  db: D1Database,
  menuId: string,
  item: CreateMenuItemRequest,
  createdBy: string
): Promise<MenuItem> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const slug = await uniqueSlug(db, menuId, item.name)

  const result = await db.prepare(`
    INSERT INTO menu_items (id, menu_id, section, name, slug, description, price_amount, image_asset_id, available, featured, featured_sort_order, sort_order,
      allergens, ingredients, dietary_notes, preparation, serving_note, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    menuId,
    item.section,
    item.name,
    slug,
    item.description || null,
    normalizePriceAmount(item.price_amount),
    item.image_asset_id || null,
    item.available !== undefined ? item.available : true,
    item.featured !== undefined ? item.featured : false,
    item.featured_sort_order || 0,
    item.sort_order || 0,
    item.allergens ? JSON.stringify(item.allergens) : null,
    item.ingredients ? JSON.stringify(item.ingredients) : null,
    item.dietary_notes ? JSON.stringify(item.dietary_notes) : null,
    item.preparation || null,
    item.serving_note || null,
    now,
    now,
    createdBy
  ).run()

  // Rely on DB unique index (menu_id, slug) for concurrent writes.
  // Callers can safely retry create on unique-constraint failures with backoff.

  if (!result.success) {
    throw new Error('Failed to create menu item')
  }

  const createdItem = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.id = ?
    LIMIT 1
  `).bind(id).first()

  if (!createdItem) {
    throw new Error('Menu item not found after creation')
  }

  await ensureMenuSectionInOrder(db, menuId, item.section, createdBy)

  return mapMenuItem(createdItem)
}

// Update menu item
export async function updateMenuItem(
  db: D1Database,
  menuItemId: string,
  updates: UpdateMenuItemRequest,
  updatedBy: string
): Promise<MenuItem> {
  const now = new Date().toISOString()

  const existing = await db.prepare(
    `SELECT menu_id, section FROM menu_items WHERE id = ? LIMIT 1`
  ).bind(menuItemId).first<{ menu_id: string; section: string | null }>()

  if (!existing) {
    throw new Error(`Menu item not found: ${menuItemId}`)
  }

  // Build dynamic update query
  const setParts: string[] = []
  const params: SqlBindValue[] = []

  if (updates.section !== undefined) {
    setParts.push('section = ?')
    params.push(updates.section)
  }
  if (updates.name !== undefined) {
    setParts.push('name = ?')
    params.push(updates.name)
    const newSlug = await uniqueSlug(db, existing.menu_id, updates.name, menuItemId)
    setParts.push('slug = ?')
    params.push(newSlug)
  }
  if (updates.description !== undefined) {
    setParts.push('description = ?')
    params.push(updates.description)
  }
  if (updates.price_amount !== undefined) {
    setParts.push('price_amount = ?')
    params.push(normalizePriceAmount(updates.price_amount))
  }
  if (updates.image_asset_id !== undefined) {
    setParts.push('image_asset_id = ?')
    params.push(updates.image_asset_id)
  }
  if (updates.available !== undefined) {
    setParts.push('available = ?')
    params.push(updates.available)
  }
  if (updates.featured !== undefined) {
    setParts.push('featured = ?')
    params.push(updates.featured)
  }
  if (updates.featured_sort_order !== undefined) {
    setParts.push('featured_sort_order = ?')
    params.push(updates.featured_sort_order)
  }
  if (updates.sort_order !== undefined) {
    setParts.push('sort_order = ?')
    params.push(updates.sort_order)
  }
  if (updates.allergens !== undefined) {
    setParts.push('allergens = ?')
    params.push(updates.allergens ? JSON.stringify(updates.allergens) : null)
  }
  if (updates.ingredients !== undefined) {
    setParts.push('ingredients = ?')
    params.push(updates.ingredients ? JSON.stringify(updates.ingredients) : null)
  }
  if (updates.dietary_notes !== undefined) {
    setParts.push('dietary_notes = ?')
    params.push(updates.dietary_notes ? JSON.stringify(updates.dietary_notes) : null)
  }
  if (updates.preparation !== undefined) {
    setParts.push('preparation = ?')
    params.push(updates.preparation || null)
  }
  if (updates.serving_note !== undefined) {
    setParts.push('serving_note = ?')
    params.push(updates.serving_note || null)
  }

  setParts.push('updated_at = ?')
  setParts.push('updated_by = ?')
  params.push(now, updatedBy)

  params.push(menuItemId)

  const result = await db.prepare(`
    UPDATE menu_items 
    SET ${setParts.join(', ')}
    WHERE id = ?
  `).bind(...params).run()

  // Rely on DB unique index (menu_id, slug) for concurrent writes.
  // Callers can safely retry updates on unique-constraint failures with backoff.

  if (!result.success) {
    throw new Error('Failed to update menu item')
  }

  const updatedItem = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.id = ?
    LIMIT 1
  `).bind(menuItemId).first()

  if (!updatedItem) {
    throw new Error('Menu item not found after update')
  }

  if (updates.section !== undefined) {
    const menuId = typeof updatedItem.menu_id === 'string' ? updatedItem.menu_id : ''
    if (menuId) {
      await ensureMenuSectionInOrder(db, menuId, updates.section, updatedBy)

      // Prune old section from section_order if it has become empty
      if (existing.section && existing.section !== updates.section) {
        const remaining = await db.prepare(
          `SELECT COUNT(*) as count FROM menu_items WHERE menu_id = ? AND section = ?`
        ).bind(menuId, existing.section).first<{ count: number }>()

        if (remaining && remaining.count === 0) {
          const sectionOrder = await getMenuSectionOrder(db, menuId)
          await saveMenuSectionOrder(db, menuId, sectionOrder.filter(s => s !== existing.section), updatedBy)
        }
      }
    }
  }

  return mapMenuItem(updatedItem)
}

// Delete menu item
export async function deleteMenuItem(
  db: D1Database,
  menuItemId: string
): Promise<void> {
  const result = await db.prepare(`
    DELETE FROM menu_items 
    WHERE id = ?
  `).bind(menuItemId).run()

  if (!result.success) {
    throw new Error('Failed to delete menu item')
  }
}

// Rename a menu section by updating every item that belongs to it
export async function renameMenuSection(
  db: D1Database,
  menuId: string,
  oldSection: string,
  newSection: string,
  updatedBy: string
): Promise<number> {
  const now = new Date().toISOString()
  const sectionOrder = await getMenuSectionOrder(db, menuId)
  const oldSectionInOrder = sectionOrder.includes(oldSection)

  if (sectionOrder.includes(newSection)) {
    throw new MenuSectionConflictError()
  }

  const result = await db.prepare(`
    UPDATE menu_items
    SET section = ?, updated_at = ?, updated_by = ?
    WHERE menu_id = ? AND section = ?
      AND NOT EXISTS (
        SELECT 1 FROM menu_items
        WHERE menu_id = ? AND section = ?
      )
  `).bind(newSection, now, updatedBy, menuId, oldSection, menuId, newSection).run()

  if (!result.success) {
    throw new Error('Failed to rename menu section')
  }

  const changes = Number(result.meta.changes ?? 0)
  if (changes > 0 || oldSectionInOrder) {
    const nextSectionOrder = sectionOrder.map(section => section === oldSection ? newSection : section)
    await saveMenuSectionOrder(db, menuId, nextSectionOrder, updatedBy)
    return changes
  }

  const oldSectionExists = await db.prepare(`
    SELECT id FROM menu_items
    WHERE menu_id = ? AND section = ?
    LIMIT 1
  `).bind(menuId, oldSection).first()

  if (!oldSectionExists) {
    throw new MenuSectionNotFoundError()
  }

  const newSectionExists = await db.prepare(`
    SELECT id FROM menu_items
    WHERE menu_id = ? AND section = ?
    LIMIT 1
  `).bind(menuId, newSection).first()

  if (newSectionExists) {
    throw new MenuSectionConflictError()
  }

  throw new Error('Failed to rename menu section')
}

// Delete every item in a menu section
export async function deleteMenuSection(
  db: D1Database,
  menuId: string,
  section: string
): Promise<number> {
  const sectionOrder = await getMenuSectionOrder(db, menuId)
  const result = await db.prepare(`
    DELETE FROM menu_items
    WHERE menu_id = ? AND section = ?
  `).bind(menuId, section).run()

  if (!result.success) {
    throw new Error('Failed to delete menu section')
  }

  if (sectionOrder.includes(section)) {
    await saveMenuSectionOrder(db, menuId, sectionOrder.filter(item => item !== section))
  }

  return result.meta.changes
}

// Reorder menu items
export async function reorderMenuItems(
  db: D1Database,
  menuId: string,
  items: Array<{ id: string; sort_order: number }>
): Promise<void> {
  await db.batch(items.map(item => 
    db.prepare(`
      UPDATE menu_items 
      SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND menu_id = ?
    `).bind(item.sort_order, item.id, menuId)
  ))
}
