import { createError } from "h3";
import type {
  Menu,
  MenuItem,
  MenuWithItems,
  CreateMenuRequest,
  UpdateMenuRequest,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
} from "../types/menu";
import { normalizePriceAmount } from "~/shared/money";
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from "~/server/db";

const MAX_SUFFIX_ATTEMPTS = 50;

type SqlBindValue = string | number | boolean | null;

interface PublishedMenuTranslation {
  name: string | null;
  description: string | null;
  section_order: string | null;
}

interface PublishedMenuItemTranslation {
  menu_item_id: string;
  section: string | null;
  name: string | null;
  description: string | null;
  allergens: string | null;
  ingredients: string | null;
  dietary_notes: string | null;
  preparation: string | null;
  serving_note: string | null;
}

export class MenuSectionConflictError extends Error {
  code = "MENU_SECTION_CONFLICT" as const;

  constructor(message = "Section already exists") {
    super(message);
    this.name = "MenuSectionConflictError";
  }
}

export class MenuSectionNotFoundError extends Error {
  code = "MENU_SECTION_NOT_FOUND" as const;

  constructor(message = "Section not found") {
    super(message);
    this.name = "MenuSectionNotFoundError";
  }
}

async function assertValidMenuLocation(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string | null | undefined,
) {
  if (!locationId) return;

  const location = await queryFirst<{ id: string }>(
    db,
    `
    SELECT id
    FROM business_locations
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `,
    [locationId, organizationId, siteId],
  );

  if (!location?.id) {
    throw createError({
      statusCode: 404,
      statusMessage: "Location not found for this site",
    });
  }
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");

  // Return fallback if slug is empty (e.g., non-ASCII only names)
  if (!slug) {
    return `untitled-${Date.now().toString(36)}`;
  }

  return slug;
}

export function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function normalizeSectionOrder(sections: unknown): string[] {
  const source = Array.isArray(sections)
    ? sections
    : parseStringArray(sections);
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const section of source) {
    if (typeof section !== "string") continue;
    const trimmed = section.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

export function mapMenu(row: Record<string, unknown>): Menu {
  return {
    ...(row as unknown as Menu),
    section_order: normalizeSectionOrder(row.section_order),
  };
}

export function mapMenuItem(row: Record<string, unknown>): MenuItem {
  return {
    ...(row as unknown as MenuItem),
    available: Boolean(row.available),
    featured: Boolean(row.featured),
    featured_sort_order:
      typeof row.featured_sort_order === "number"
        ? row.featured_sort_order
        : Number(row.featured_sort_order ?? 0),
    allergens: parseStringArray(row.allergens),
    ingredients: parseStringArray(row.ingredients),
    dietary_notes: parseStringArray(row.dietary_notes),
  };
}

export function sortMenuItems(items: MenuItem[], sectionOrder: string[]): MenuItem[] {
  const sectionIndex = new Map(
    sectionOrder.map((section, index) => [section, index]),
  );
  return [...items].sort((a, b) => {
    const sectionA = a.section || "Uncategorized";
    const sectionB = b.section || "Uncategorized";
    const indexA = sectionIndex.get(sectionA);
    const indexB = sectionIndex.get(sectionB);

    if (indexA !== undefined || indexB !== undefined) {
      if (indexA === undefined) return 1;
      if (indexB === undefined) return -1;
      if (indexA !== indexB) return indexA - indexB;
    } else if (sectionA !== sectionB) {
      return sectionA.localeCompare(sectionB);
    }

    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

async function applyPublishedMenuTranslations(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menu: MenuWithItems,
  locale?: string,
): Promise<MenuWithItems> {
  if (!locale) return menu;

  const menuTranslation = await queryFirst<PublishedMenuTranslation>(
    db,
    `
    SELECT name, description, section_order
    FROM menu_translations
    WHERE organization_id = ? AND site_id = ? AND menu_id = ? AND locale = ? AND status = 'published'
    LIMIT 1
  `,
    [organizationId, siteId, menu.id, locale],
  );

  const results = await queryAll<PublishedMenuItemTranslation>(
    db,
    `
    SELECT menu_item_id, section, name, description, allergens, ingredients, dietary_notes, preparation, serving_note
    FROM menu_item_translations
    WHERE organization_id = ? AND site_id = ? AND locale = ? AND status = 'published'
      AND menu_item_id IN (SELECT id FROM menu_items WHERE menu_id = ?)
  `,
    [organizationId, siteId, locale, menu.id],
  );

  const itemTranslations = new Map(
    (results ?? []).map((row) => [row.menu_item_id, row]),
  );
  const sectionOrder = menuTranslation?.section_order
    ? normalizeSectionOrder(menuTranslation.section_order)
    : (menu.section_order ?? []);

  const translatedItems = menu.items.map((item) => {
    const translation = itemTranslations.get(item.id);
    if (!translation) return item;

    return {
      ...item,
      section: translation.section ?? item.section,
      name: translation.name ?? item.name,
      description: translation.description ?? item.description,
      allergens:
        translation.allergens !== null
          ? parseStringArray(translation.allergens)
          : item.allergens,
      ingredients:
        translation.ingredients !== null
          ? parseStringArray(translation.ingredients)
          : item.ingredients,
      dietary_notes:
        translation.dietary_notes !== null
          ? parseStringArray(translation.dietary_notes)
          : item.dietary_notes,
      preparation: translation.preparation ?? item.preparation,
      serving_note: translation.serving_note ?? item.serving_note,
    };
  });

  return {
    ...menu,
    name: menuTranslation?.name ?? menu.name,
    description: menuTranslation?.description ?? menu.description,
    section_order: sectionOrder,
    items: sortMenuItems(translatedItems, sectionOrder),
  };
}

async function getMenuSectionOrder(
  db: DbClient,
  menuId: string,
): Promise<string[]> {
  const row = await queryFirst<{ section_order: string | null }>(
    db,
    "SELECT section_order FROM menus WHERE id = ? LIMIT 1",
    [menuId],
  );
  return normalizeSectionOrder(row?.section_order);
}

async function getMenuSectionOrderWithVersion(
  db: DbClient,
  menuId: string,
): Promise<{ sectionOrder: string[]; updatedAt: string }> {
  const row = await queryFirst<{ section_order: string | null; updated_at: string }>(
    db,
    "SELECT section_order, updated_at FROM menus WHERE id = ? LIMIT 1",
    [menuId],
  );
  return {
    sectionOrder: normalizeSectionOrder(row?.section_order),
    updatedAt: row?.updated_at ?? "",
  };
}

async function saveMenuSectionOrder(
  db: DbClient,
  menuId: string,
  sectionOrder: string[],
  updatedBy?: string,
  expectedUpdatedAt?: string,
): Promise<boolean> {
  const normalized = normalizeSectionOrder(sectionOrder);
  const now = new Date().toISOString();

  let query = "UPDATE menus SET section_order = ?, updated_at = ?";
  const params: (string | number | null)[] = [JSON.stringify(normalized), now];

  if (updatedBy) {
    query += ", updated_by = ?";
    params.push(updatedBy);
  }

  query += " WHERE id = ?";
  params.push(menuId);

  if (expectedUpdatedAt) {
    query += " AND updated_at = ?";
    params.push(expectedUpdatedAt);
  }

  const result = await execute(db, query, params);
  if (!result.success) throw new Error("Failed to update menu section order");
  return Number(result.meta.changes ?? 0) > 0;
}

async function ensureMenuSectionInOrder(
  db: DbClient,
  menuId: string,
  section: string,
  updatedBy?: string,
): Promise<void> {
  const normalizedSection = section.trim();
  if (!normalizedSection) return;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { sectionOrder, updatedAt } = await getMenuSectionOrderWithVersion(
      db,
      menuId,
    );
    if (sectionOrder.includes(normalizedSection)) return;

    const success = await saveMenuSectionOrder(
      db,
      menuId,
      [...sectionOrder, normalizedSection],
      updatedBy,
      updatedAt,
    );
    if (success) return;
  }
  throw new Error(
    "Failed to ensure menu section order due to concurrent modifications",
  );
}

async function uniqueSlug(
  db: DbClient,
  menuId: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  // Get site_id from menuId to ensure site-wide uniqueness for public URLs
  const menu = await queryFirst<{ site_id: string }>(
    db,
    `SELECT site_id FROM menus WHERE id = ?`,
    [menuId],
  );
  const siteId = menu?.site_id;

  if (!siteId) throw new Error("Menu not found for slug generation");

  const baseSlug = slugify(base);
  let candidate = baseSlug;
  let suffix = 1;
  while (suffix <= MAX_SUFFIX_ATTEMPTS) {
    const query = excludeId
      ? `SELECT mi.id FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.site_id = ? AND mi.slug = ? AND mi.id != ? LIMIT 1`
      : `SELECT mi.id FROM menu_items mi JOIN menus m ON m.id = mi.menu_id WHERE m.site_id = ? AND mi.slug = ? LIMIT 1`;
    const params = excludeId
      ? [siteId, candidate, excludeId]
      : [siteId, candidate];
    const existing = await queryFirst(db, query, params);
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }

  throw new Error(
    `Failed to generate unique slug for "${base}" after ${MAX_SUFFIX_ATTEMPTS} attempts`,
  );
}

// Get menus for a site with optional location filter
export async function getMenus(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId?: string | null,
): Promise<Menu[]> {
  let query = `
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus
    WHERE organization_id = ? AND site_id = ?
  `;
  const params: (string | null)[] = [organizationId, siteId];

  if (locationId !== undefined && locationId !== null && locationId !== "") {
    // Include menus for this specific location AND site-wide menus (location_id IS NULL)
    query += ` AND (location_id = ? OR location_id IS NULL)`;
    params.push(locationId);
  }

  query += ` ORDER BY location_id IS NULL, (status = 'published') DESC, name`;

  const results = await queryAll<Record<string, unknown>>(db, query, params);
  return (results || []).map((row) => mapMenu(row));
}

// Get menu with items
export async function getMenuWithItems(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menuId: string,
): Promise<MenuWithItems | null> {
  // Get menu
  const menu = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `,
    [menuId, organizationId, siteId],
  );

  if (!menu) return null;
  const mappedMenu = mapMenu(menu);

  // Get menu items
  const items = await queryAll<Record<string, unknown>>(
    db,
    `
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.thumbnail_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.menu_id = ?
    ORDER BY mi.sort_order, mi.name
  `,
    [menuId],
  );

  return {
    ...mappedMenu,
    items: sortMenuItems(
      (items || []).map(mapMenuItem),
      mappedMenu.section_order ?? [],
    ),
  };
}

async function loadPublishedMenuById(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menuRow: Record<string, unknown>,
  locale?: string,
): Promise<MenuWithItems> {
  const mappedMenu = mapMenu(menuRow);
  const items = await queryAll<Record<string, unknown>>(
    db,
    `
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.thumbnail_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.menu_id = ?
    ORDER BY mi.sort_order, mi.name
  `,
    [menuRow.id],
  );

  const menuWithItems = {
    ...mappedMenu,
    items: sortMenuItems(
      (items || []).map(mapMenuItem),
      mappedMenu.section_order ?? [],
    ),
  };
  return applyPublishedMenuTranslations(
    db,
    organizationId,
    siteId,
    menuWithItems,
    locale,
  );
}

// Get active menu for a scope (brand or location)
export async function getActiveMenu(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId?: string | null,
  locale?: string,
): Promise<MenuWithItems | null> {
  // First try to get location-specific menu
  if (locationId) {
    const locationMenu = await queryFirst<Record<string, unknown>>(
      db,
      `
      SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
             created_at, updated_at, created_by, updated_by
      FROM menus
      WHERE organization_id = ? AND site_id = ? AND location_id = ? AND status = 'published'
      LIMIT 1
    `,
      [organizationId, siteId, locationId],
    );

    if (locationMenu) {
      return loadPublishedMenuById(db, organizationId, siteId, locationMenu, locale);
    }
  }

  // Fall back to brand/default menu (no location_id)
  const brandMenu = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus
    WHERE organization_id = ? AND site_id = ? AND location_id IS NULL AND status = 'published'
    LIMIT 1
  `,
    [organizationId, siteId],
  );

  if (brandMenu) {
    return loadPublishedMenuById(db, organizationId, siteId, brandMenu, locale);
  }

  // Sites with only location-scoped menus (no brand-level menu) still need a
  // default to show on non-location pages, so fall back to the primary
  // (or first) active location's published menu.
  const fallbackLocationMenu = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT m.id, m.organization_id, m.site_id, m.location_id, m.name, m.description, m.status, m.section_order,
           m.created_at, m.updated_at, m.created_by, m.updated_by
    FROM menus m
    JOIN business_locations bl ON bl.id = m.location_id
    WHERE m.organization_id = ? AND m.site_id = ? AND m.status = 'published' AND bl.status = 'active'
    ORDER BY bl.is_primary DESC, bl.title ASC
    LIMIT 1
  `,
    [organizationId, siteId],
  );

  if (!fallbackLocationMenu) return null;
  return loadPublishedMenuById(db, organizationId, siteId, fallbackLocationMenu, locale);
}

// Get public menu item by slug
export async function getPublicMenuItem(
  db: DbClient,
  siteId: string,
  slug: string,
): Promise<MenuItem | null> {
  const item = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.thumbnail_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE m.site_id = ? AND mi.slug = ? AND m.status = 'published'
    LIMIT 1
  `,
    [siteId, slug],
  );

  return item ? mapMenuItem(item) : null;
}

// Create menu
export async function createMenu(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menu: CreateMenuRequest,
  createdBy: string,
): Promise<Menu> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const locationId = menu.locationId?.trim() || null;

  await assertValidMenuLocation(db, organizationId, siteId, locationId);

  const result = await execute(
    db,
    `
    INSERT INTO menus (id, organization_id, site_id, location_id, name, description, status, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)
  `,
    [
      id,
      organizationId,
      siteId,
      locationId,
      menu.name,
      menu.description || null,
      now,
      now,
      createdBy,
    ],
  );

  if (!result.success) {
    throw new Error("Failed to create menu");
  }

  return {
    id,
    organization_id: organizationId,
    site_id: siteId,
    location_id: locationId,
    name: menu.name,
    description: menu.description || null,
    status: "published",
    created_at: now,
    updated_at: now,
    created_by: createdBy,
    updated_by: null,
    section_order: [],
  };
}

// Update menu
export async function updateMenu(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menuId: string,
  updates: UpdateMenuRequest,
  updatedBy: string,
): Promise<Menu> {
  const now = new Date().toISOString();

  // Build dynamic update query
  const setParts: string[] = [];
  const params: SqlBindValue[] = [];

  if (updates.name !== undefined) {
    setParts.push("name = ?");
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    setParts.push("description = ?");
    params.push(updates.description);
  }
  if (updates.status !== undefined) {
    setParts.push("status = ?");
    params.push(updates.status);
  }
  if (updates.section_order !== undefined) {
    setParts.push("section_order = ?");
    params.push(JSON.stringify(normalizeSectionOrder(updates.section_order)));
  }

  setParts.push("updated_at = ?");
  setParts.push("updated_by = ?");
  params.push(now, updatedBy);

  params.push(menuId, organizationId, siteId);

  const result = await execute(
    db,
    `
    UPDATE menus
    SET ${setParts.join(", ")}
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `,
    params,
  );

  if (!result.success) {
    throw new Error("Failed to update menu");
  }

  const updatedMenu = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT id, organization_id, site_id, location_id, name, description, status, section_order,
           created_at, updated_at, created_by, updated_by
    FROM menus
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `,
    [menuId, organizationId, siteId],
  );

  if (!updatedMenu) {
    throw new Error("Menu not found after update");
  }

  return mapMenu(updatedMenu);
}

// Delete menu
export async function deleteMenu(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menuId: string,
): Promise<void> {
  const result = await execute(
    db,
    `
    DELETE FROM menus
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `,
    [menuId, organizationId, siteId],
  );

  if (!result.success) {
    throw new Error("Failed to delete menu");
  }
}

// Create menu item
export async function createMenuItem(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menuId: string,
  item: CreateMenuItemRequest,
  createdBy: string,
): Promise<MenuItem> {
  const menuOwner = await queryFirst<{ id: string }>(
    db,
    `SELECT id FROM menus WHERE id = ? AND organization_id = ? AND site_id = ? LIMIT 1`,
    [menuId, organizationId, siteId],
  );
  if (!menuOwner) throw createError({ statusCode: 404, statusMessage: "Menu not found" });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = await uniqueSlug(db, menuId, item.name);

  const result = await execute(
    db,
    `
    INSERT INTO menu_items (id, menu_id, section, name, slug, description, price_amount, image_asset_id, available, featured, featured_sort_order, sort_order,
      allergens, ingredients, dietary_notes, preparation, serving_note, created_at, updated_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
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
      createdBy,
    ],
  );

  // Rely on DB unique index (menu_id, slug) for concurrent writes.
  // Callers can safely retry create on unique-constraint failures with backoff.

  if (!result.success) {
    throw new Error("Failed to create menu item");
  }

  const createdItem = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.thumbnail_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.id = ?
    LIMIT 1
  `,
    [id],
  );

  if (!createdItem) {
    throw new Error("Menu item not found after creation");
  }

  await ensureMenuSectionInOrder(db, menuId, item.section, createdBy);

  return mapMenuItem(createdItem);
}

// Update menu item
export async function updateMenuItem(
  db: DbClient,
  organizationId: string,
  siteId: string,
  menuItemId: string,
  updates: UpdateMenuItemRequest,
  updatedBy: string,
): Promise<MenuItem> {
  const now = new Date().toISOString();

  const existing = await queryFirst<{ menu_id: string; section: string | null }>(
    db,
    `
      SELECT mi.menu_id, mi.section
      FROM menu_items mi
      JOIN menus m ON mi.menu_id = m.id
      WHERE mi.id = ? AND m.organization_id = ? AND m.site_id = ?
      LIMIT 1
    `,
    [menuItemId, organizationId, siteId],
  );

  if (!existing) {
    throw new Error(`Menu item not found: ${menuItemId}`);
  }

  // Build dynamic update query
  const setParts: string[] = [];
  const params: SqlBindValue[] = [];

  if (updates.section !== undefined) {
    setParts.push("section = ?");
    params.push(updates.section);
  }
  if (updates.name !== undefined) {
    setParts.push("name = ?");
    params.push(updates.name);
    const newSlug = await uniqueSlug(
      db,
      existing.menu_id,
      updates.name,
      menuItemId,
    );
    setParts.push("slug = ?");
    params.push(newSlug);
  }
  if (updates.description !== undefined) {
    setParts.push("description = ?");
    params.push(updates.description);
  }
  if (updates.price_amount !== undefined) {
    setParts.push("price_amount = ?");
    params.push(normalizePriceAmount(updates.price_amount));
  }
  if (updates.image_asset_id !== undefined) {
    setParts.push("image_asset_id = ?");
    params.push(updates.image_asset_id);
  }
  if (updates.available !== undefined) {
    setParts.push("available = ?");
    params.push(updates.available);
  }
  if (updates.featured !== undefined) {
    setParts.push("featured = ?");
    params.push(updates.featured);
  }
  if (updates.featured_sort_order !== undefined) {
    setParts.push("featured_sort_order = ?");
    params.push(updates.featured_sort_order);
  }
  if (updates.sort_order !== undefined) {
    setParts.push("sort_order = ?");
    params.push(updates.sort_order);
  }
  if (updates.allergens !== undefined) {
    setParts.push("allergens = ?");
    params.push(updates.allergens ? JSON.stringify(updates.allergens) : null);
  }
  if (updates.ingredients !== undefined) {
    setParts.push("ingredients = ?");
    params.push(
      updates.ingredients ? JSON.stringify(updates.ingredients) : null,
    );
  }
  if (updates.dietary_notes !== undefined) {
    setParts.push("dietary_notes = ?");
    params.push(
      updates.dietary_notes ? JSON.stringify(updates.dietary_notes) : null,
    );
  }
  if (updates.preparation !== undefined) {
    setParts.push("preparation = ?");
    params.push(updates.preparation || null);
  }
  if (updates.serving_note !== undefined) {
    setParts.push("serving_note = ?");
    params.push(updates.serving_note || null);
  }

  setParts.push("updated_at = ?");
  setParts.push("updated_by = ?");
  setParts.push("source = ?");
  params.push(now, updatedBy, "manual");

  params.push(menuItemId);

  const result = await execute(
    db,
    `
    UPDATE menu_items
    SET ${setParts.join(", ")}
    WHERE id = ?
  `,
    params,
  );

  // Rely on DB unique index (menu_id, slug) for concurrent writes.
  // Callers can safely retry updates on unique-constraint failures with backoff.

  if (!result.success) {
    throw new Error("Failed to update menu item");
  }

  const updatedItem = await queryFirst<Record<string, unknown>>(
    db,
    `
    SELECT mi.id, mi.menu_id, mi.section, mi.name, mi.slug, mi.description, mi.price_amount,
           mi.image_asset_id, ma.public_url, ma.thumbnail_url, ma.kind, mi.available, mi.featured, mi.featured_sort_order, mi.sort_order,
           mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note,
           mi.created_at, mi.updated_at, mi.created_by, mi.updated_by
    FROM menu_items mi
    LEFT JOIN media_assets ma ON mi.image_asset_id = ma.id AND ma.status = 'active'
    WHERE mi.id = ?
    LIMIT 1
  `,
    [menuItemId],
  );

  if (!updatedItem) {
    throw new Error("Menu item not found after update");
  }

  if (updates.section !== undefined) {
    const menuId =
      typeof updatedItem.menu_id === "string" ? updatedItem.menu_id : "";
    if (menuId) {
      await ensureMenuSectionInOrder(db, menuId, updates.section, updatedBy);

      // Prune old section from section_order if it has become empty
      if (existing.section && existing.section !== updates.section) {
        const remaining = await queryFirst<{ count: number }>(
          db,
          `SELECT COUNT(*) as count FROM menu_items WHERE menu_id = ? AND section = ?`,
          [menuId, existing.section],
        );

        if (remaining && remaining.count === 0) {
          const sectionOrder = await getMenuSectionOrder(db, menuId);
          await saveMenuSectionOrder(
            db,
            menuId,
            sectionOrder.filter((s) => s !== existing.section),
            updatedBy,
          );
        }
      }
    }
  }

  return mapMenuItem(updatedItem);
}

// Delete menu item
export async function deleteMenuItem(
  db: DbClient,
  menuItemId: string,
  organizationId: string,
  siteId: string,
  updatedBy?: string,
): Promise<boolean> {
  const existing = await queryFirst<{ menu_id: string; section: string | null }>(
    db,
    `SELECT mi.menu_id, mi.section
     FROM menu_items mi
     JOIN menus m ON mi.menu_id = m.id
     WHERE mi.id = ? AND m.organization_id = ? AND m.site_id = ?
     LIMIT 1`,
    [menuItemId, organizationId, siteId],
  );

  if (!existing) return false;

  const result = await execute(db, `DELETE FROM menu_items WHERE id = ?`, [menuItemId]);

  if (!result.success) {
    throw new Error("Failed to delete menu item");
  }

  if (existing?.menu_id && existing.section) {
    const remaining = await queryFirst<{ count: number }>(
      db,
      `SELECT COUNT(*) as count FROM menu_items WHERE menu_id = ? AND section = ?`,
      [existing.menu_id, existing.section],
    );

    if (remaining && remaining.count === 0) {
      const sectionOrder = await getMenuSectionOrder(db, existing.menu_id);
      await saveMenuSectionOrder(
        db,
        existing.menu_id,
        sectionOrder.filter((s) => s !== existing.section),
        updatedBy,
      );
    }
  }

  return true;
}

// Rename a menu section by updating every item that belongs to it
export async function renameMenuSection(
  db: DbClient,
  menuId: string,
  oldSection: string,
  newSection: string,
  updatedBy: string,
): Promise<number> {
  const now = new Date().toISOString();
  const sectionOrder = await getMenuSectionOrder(db, menuId);
  const oldSectionInOrder = sectionOrder.includes(oldSection);

  if (sectionOrder.includes(newSection)) {
    throw new MenuSectionConflictError();
  }

  const result = await execute(
    db,
    `
    UPDATE menu_items
    SET section = ?, updated_at = ?, updated_by = ?
    WHERE menu_id = ? AND section = ?
      AND NOT EXISTS (
        SELECT 1 FROM menu_items
        WHERE menu_id = ? AND section = ?
      )
  `,
    [newSection, now, updatedBy, menuId, oldSection, menuId, newSection],
  );

  if (!result.success) {
    throw new Error("Failed to rename menu section");
  }

  const changes = Number(result.meta.changes ?? 0);
  if (changes > 0 || oldSectionInOrder) {
    const nextSectionOrder = sectionOrder.map((section) =>
      section === oldSection ? newSection : section,
    );
    await saveMenuSectionOrder(db, menuId, nextSectionOrder, updatedBy);
    return changes;
  }

  const oldSectionExists = await queryFirst(
    db,
    `
    SELECT id FROM menu_items
    WHERE menu_id = ? AND section = ?
    LIMIT 1
  `,
    [menuId, oldSection],
  );

  if (!oldSectionExists) {
    throw new MenuSectionNotFoundError();
  }

  const newSectionExists = await queryFirst(
    db,
    `
    SELECT id FROM menu_items
    WHERE menu_id = ? AND section = ?
    LIMIT 1
  `,
    [menuId, newSection],
  );

  if (newSectionExists) {
    throw new MenuSectionConflictError();
  }

  throw new Error("Failed to rename menu section");
}

// Delete every item in a menu section
export async function deleteMenuSection(
  db: DbClient,
  menuId: string,
  section: string,
): Promise<number> {
  const sectionOrder = await getMenuSectionOrder(db, menuId);
  const result = await execute(
    db,
    `
    DELETE FROM menu_items
    WHERE menu_id = ? AND section = ?
  `,
    [menuId, section],
  );

  if (!result.success) {
    throw new Error("Failed to delete menu section");
  }

  if (sectionOrder.includes(section)) {
    await saveMenuSectionOrder(
      db,
      menuId,
      sectionOrder.filter((item) => item !== section),
    );
  }

  return Number(result.meta.changes ?? 0);
}

// Reorder menu items
export async function reorderMenuItems(
  db: DbClient,
  menuId: string,
  items: Array<{ id: string; sort_order: number }>,
): Promise<void> {
  // Reorder must commit atomically: a partial failure here must not leave
  // items with inconsistent sort_order relative to each other.
  const results = await executeBatch(
    db,
    items.map((item) => ({
      query: `
      UPDATE menu_items
      SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND menu_id = ?
    `,
      params: [item.sort_order, item.id, menuId],
    })),
  );

  // The WHERE clause scopes each update to this menu, so a stale/foreign id
  // can't corrupt another menu's rows — but it would otherwise fail silently
  // (zero rows affected) instead of surfacing the bad id to the caller.
  const unmatched = results.reduce(
    (count, result, index) => (Number(result?.meta?.changes ?? 0) > 0 ? count : count + (items[index] ? 1 : 0)),
    0,
  );
  if (unmatched > 0) {
    throw new Error(`Failed to reorder ${unmatched} menu item(s): not found in menu ${menuId}`);
  }
}
