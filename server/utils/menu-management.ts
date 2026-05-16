import type { Menu, MenuItem, MenuWithItems, CreateMenuRequest, UpdateMenuRequest, CreateMenuItemRequest, UpdateMenuItemRequest } from '../types/menu'

const MAX_SUFFIX_ATTEMPTS = 50

type SqlBindValue = string | number | boolean | null

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
    SELECT id, organization_id, site_id, location_id, name, description, status, 
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
  return (results.results || []) as unknown as Menu[]
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
    SELECT id, organization_id, site_id, location_id, name, description, status, 
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(menuId, organizationId, siteId).first<Menu>()

  if (!menu) return null

  // Get menu items
  const items = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.sort_order,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.menu_id = ?
    ORDER BY mi.section, mi.sort_order, mi.name
  `).bind(menuId).all()

  return {
    ...menu,
    items: (items.results || []) as unknown as MenuItem[]
  }
}

// Get active menu for a scope (brand or location)
export async function getActiveMenu(
  db: D1Database,
  organizationId: string,
  siteId: string,
  locationId?: string | null
): Promise<MenuWithItems | null> {
  // First try to get location-specific menu
  if (locationId) {
    const locationMenu = await db.prepare(`
      SELECT id, organization_id, site_id, location_id, name, description, status, 
             created_at, updated_at, created_by, updated_by
      FROM menus 
      WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'published'
      LIMIT 1
    `).bind(organizationId, siteId, locationId).first<Menu>()

    if (locationMenu) {
      const items = await db.prepare(`
        SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price,
               mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.sort_order,
               mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
        FROM menu_items mi
        LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
        WHERE mi.menu_id = ?
        ORDER BY mi.section, mi.sort_order, mi.name
      `).bind(locationMenu.id).all()

      return {
        ...locationMenu,
        items: (items.results || []) as unknown as MenuItem[]
      }
    }
  }

  // Fall back to brand/default menu
  const brandMenu = await db.prepare(`
    SELECT id, organization_id, site_id, location_id, name, description, status, 
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE organization_id = ? AND site_id = ? AND location_id IS NULL AND status = 'published'
    LIMIT 1
  `).bind(organizationId, siteId).first<Menu>()

  if (!brandMenu) return null

  const items = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.sort_order,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.menu_id = ?
    ORDER BY mi.section, mi.sort_order, mi.name
  `).bind(brandMenu.id).all()

  return {
    ...brandMenu,
    items: (items.results || []) as unknown as MenuItem[]
  }
}

// Get public menu item by slug
export async function getPublicMenuItem(
  db: D1Database,
  siteId: string,
  slug: string
): Promise<MenuItem | null> {
  const item = await db.prepare(`
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price,
           mi.image_asset_id, ma.public_url, ma.kind, mi.available, mi.sort_order,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE m.site_id = ? AND mi.slug = ? AND m.status = 'published'
    LIMIT 1
  `).bind(siteId, slug).first<MenuItem>()

  return item || null
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
    updated_by: null
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
    SELECT id, organization_id, site_id, location_id, name, description, status, 
           created_at, updated_at, created_by, updated_by
    FROM menus 
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `).bind(menuId, organizationId, siteId).first<Menu>()

  if (!updatedMenu) {
    throw new Error('Menu not found after update')
  }

  return updatedMenu
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
    INSERT INTO menu_items (id, menu_id, section, name, slug, description, price, image_asset_id, available, sort_order, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    menuId,
    item.section,
    item.name,
    slug,
    item.description || null,
    item.price || null,
    item.image_asset_id || null,
    item.available !== undefined ? item.available : true,
    item.sort_order || 0,
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
    SELECT id, menu_id, section, name, slug, description, price, image_asset_id, available, sort_order,
           created_at, updated_at, created_by, updated_by
    FROM menu_items 
    WHERE id = ?
    LIMIT 1
  `).bind(id).first<MenuItem>()

  if (!createdItem) {
    throw new Error('Menu item not found after creation')
  }

  return createdItem
}

// Update menu item
export async function updateMenuItem(
  db: D1Database,
  menuItemId: string,
  updates: UpdateMenuItemRequest,
  updatedBy: string
): Promise<MenuItem> {
  const now = new Date().toISOString()

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
    // Fetch menu_id to scope the slug uniqueness check
    const existing = await db.prepare(
      `SELECT menu_id FROM menu_items WHERE id = ? LIMIT 1`
    ).bind(menuItemId).first() as { menu_id: string | null } | null
    if (existing?.menu_id) {
      const newSlug = await uniqueSlug(db, existing.menu_id, updates.name, menuItemId)
      setParts.push('slug = ?')
      params.push(newSlug)
    } else {
      throw new Error(`Missing menu_id for menu item ${menuItemId}`)
    }
  }
  if (updates.description !== undefined) {
    setParts.push('description = ?')
    params.push(updates.description)
  }
  if (updates.price !== undefined) {
    setParts.push('price = ?')
    params.push(updates.price)
  }
  if (updates.image_asset_id !== undefined) {
    setParts.push('image_asset_id = ?')
    params.push(updates.image_asset_id)
  }
  if (updates.available !== undefined) {
    setParts.push('available = ?')
    params.push(updates.available)
  }
  if (updates.sort_order !== undefined) {
    setParts.push('sort_order = ?')
    params.push(updates.sort_order)
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
    SELECT id, menu_id, section, name, slug, description, price, image_asset_id, available, sort_order,
           created_at, updated_at, created_by, updated_by
    FROM menu_items 
    WHERE id = ?
    LIMIT 1
  `).bind(menuItemId).first<MenuItem>()

  if (!updatedItem) {
    throw new Error('Menu item not found after update')
  }

  return updatedItem
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
  if (changes > 0) {
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
  const result = await db.prepare(`
    DELETE FROM menu_items
    WHERE menu_id = ? AND section = ?
  `).bind(menuId, section).run()

  if (!result.success) {
    throw new Error('Failed to delete menu section')
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
