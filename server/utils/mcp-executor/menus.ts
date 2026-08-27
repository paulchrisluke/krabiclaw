import type { MenuItem, UpdateMenuItemRequest } from '~/server/types/menu'
import type { McpExecutorContext } from './shared'
import { d1JsonValue, executeBatch, MAX_D1_JSON_BIND_BYTES, queryAll, queryFirst, type BatchQuery } from '~/server/db'
import { assertValidSaleWindow, normalizePriceAmount } from '~/shared/money'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createMenu, createMenuItem, deleteMenu, deleteMenuItem, deleteMenuSection, getMenuWithItems, getMenus, MenuNotFoundError, renameMenuSection, reorderMenuItems, updateMenu, updateMenuItem } from '~/server/utils/menu-management'
import { hydrateMediaAssetRefs, parseMediaAssetRefs } from '~/server/utils/media-asset-manager'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { paginateMcpCollection } from '~/server/utils/mcp-pagination'
import { MAX_MENU_BATCH_ITEMS } from '~/server/utils/menu-batch-limits'
import { NOT_HANDLED, isUniqueConstraintError, menuItemLookupKey, mutationContextPayload, normalizeMenuItemArgs, objectArray, omit, optionalString, requiredString, resolveMenuLocationId, toolString } from './shared'

function toolBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
}

function stringArraysEqual(a: string[], b: string[] | null | undefined): boolean {
  const other = b ?? []
  if (a.length !== other.length) return false
  return a.every((value, index) => value === other[index])
}

function findMenuItemMatch(itemRecord: Record<string, unknown>, menuItems: MenuItem[]): MenuItem | null {
  const itemId = toolString(itemRecord, 'item_id', 120)
  if (itemId) return menuItems.find((item) => item.id === itemId) ?? null

  const name = toolString(itemRecord, 'name', 200)?.trim()
  if (!name) return null

  const key = menuItemLookupKey(name)
  const lowerName = name.toLowerCase()
  return menuItems.find((item) => item.slug === key || item.name.toLowerCase() === lowerName) ?? null
}

function buildMenuItemUpdates(itemRecord: Record<string, unknown>, match?: MenuItem | null): UpdateMenuItemRequest {
  const updates: UpdateMenuItemRequest = {}
  const section = toolString(itemRecord, 'section', 100)
  const name = toolString(itemRecord, 'name', 200)
  const description = toolString(itemRecord, 'description', 500)
  const priceAmount = toolString(itemRecord, 'price_amount', 50)
  const compareAtPriceAmount = toolString(itemRecord, 'compare_at_price_amount', 50)
  const saleStartsAt = toolString(itemRecord, 'sale_starts_at', 50)
  const saleEndsAt = toolString(itemRecord, 'sale_ends_at', 50)
  const available = toolBoolean(itemRecord, 'available')

  const allergens = Array.isArray(itemRecord.allergens) ? itemRecord.allergens as string[] : undefined
  const ingredients = Array.isArray(itemRecord.ingredients) ? itemRecord.ingredients as string[] : undefined
  const dietaryNotes = Array.isArray(itemRecord.dietary_notes) ? itemRecord.dietary_notes as string[] : undefined
  const preparation = toolString(itemRecord, 'preparation', 500)
  const servingNote = toolString(itemRecord, 'serving_note', 500)

  if (section !== undefined && section.trim() && section !== match?.section) updates.section = section
  if (name !== undefined && name !== match?.name) updates.name = name
  if (description !== undefined && description !== match?.description) updates.description = description
  if (priceAmount !== undefined && priceAmount !== match?.price_amount) updates.price_amount = priceAmount
  if (compareAtPriceAmount !== undefined && compareAtPriceAmount !== match?.compare_at_price_amount) updates.compare_at_price_amount = compareAtPriceAmount
  if (saleStartsAt !== undefined && saleStartsAt !== match?.sale_starts_at) updates.sale_starts_at = saleStartsAt
  if (saleEndsAt !== undefined && saleEndsAt !== match?.sale_ends_at) updates.sale_ends_at = saleEndsAt
  if (available !== undefined && available !== Boolean(match?.available)) updates.available = available
  if (allergens !== undefined && !stringArraysEqual(allergens, match?.allergens)) updates.allergens = allergens
  if (ingredients !== undefined && !stringArraysEqual(ingredients, match?.ingredients)) updates.ingredients = ingredients
  if (dietaryNotes !== undefined && !stringArraysEqual(dietaryNotes, match?.dietary_notes)) updates.dietary_notes = dietaryNotes
  if (preparation !== undefined && preparation !== match?.preparation) updates.preparation = preparation
  if (servingNote !== undefined && servingNote !== match?.serving_note) updates.serving_note = servingNote

  return updates
}

function rethrowMenuOwnershipAsInvalidParams(error: unknown): never {
  if (error instanceof MenuNotFoundError) {
    throw mcpProtocolError(MCP_ERROR.invalidParams, error.message);
  }
  throw error;
}

type CreatedMenuItemPlan = {
  id: string
  item: Record<string, unknown>
  name: string
  section: string
  slug: string
  media: Array<{ asset_id: string }>
}

function allocateMenuItemSlug(name: string, reserved: Set<string>): string {
  const base = menuItemLookupKey(name) || `item-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
  let candidate = base
  let suffix = 1
  while (reserved.has(candidate)) candidate = `${base}-${suffix++}`
  reserved.add(candidate)
  return candidate
}

function createMenuItemBatchQuery(menuId: string, plan: CreatedMenuItemPlan, now: string, actorId: string): BatchQuery {
  const item = plan.item
  assertValidSaleWindow(toolString(item, 'sale_starts_at', 50), toolString(item, 'sale_ends_at', 50))
  return {
    query: `INSERT INTO menu_items (
      id, menu_id, section, name, slug, description, price_amount, compare_at_price_amount,
      sale_starts_at, sale_ends_at, available, featured, featured_sort_order, sort_order,
      allergens, ingredients, dietary_notes, preparation, serving_note,
      seo_title, seo_description, canonical_url, robots, created_at, updated_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      plan.id, menuId, plan.section, plan.name, plan.slug,
      toolString(item, 'description', 500) ?? null,
      normalizePriceAmount(item.price_amount as string | number | null | undefined),
      normalizePriceAmount(item.compare_at_price_amount as string | number | null | undefined),
      toolString(item, 'sale_starts_at', 50) ?? null,
      toolString(item, 'sale_ends_at', 50) ?? null,
      typeof item.available === 'boolean' ? item.available : true,
      typeof item.featured === 'boolean' ? item.featured : false,
      typeof item.featured_sort_order === 'number' ? item.featured_sort_order : 0,
      typeof item.sort_order === 'number' ? item.sort_order : 0,
      Array.isArray(item.allergens) ? JSON.stringify(item.allergens) : null,
      Array.isArray(item.ingredients) ? JSON.stringify(item.ingredients) : null,
      Array.isArray(item.dietary_notes) ? JSON.stringify(item.dietary_notes) : null,
      toolString(item, 'preparation', 500) ?? null,
      toolString(item, 'serving_note', 500) ?? null,
      toolString(item, 'seo_title', 500) ?? null,
      toolString(item, 'seo_description', 500) ?? null,
      toolString(item, 'canonical_url', 2000) ?? null,
      toolString(item, 'robots', 100) ?? null,
      now, now, actorId,
    ],
  }
}

type MenuItemMediaPlacementPlan = {
  id: string
  owner_id: string
  asset_id: string
  sort_order: number
}

function chunkMenuItemMediaPlacements(placements: MenuItemMediaPlacementPlan[]): MenuItemMediaPlacementPlan[][] {
  const encoder = new TextEncoder()
  const chunks: MenuItemMediaPlacementPlan[][] = []
  let chunk: MenuItemMediaPlacementPlan[] = []
  let chunkBytes = 2

  for (const placement of placements) {
    const placementBytes = encoder.encode(JSON.stringify(placement)).byteLength
    const nextBytes = chunkBytes + (chunk.length ? 1 : 0) + placementBytes
    if (chunk.length && nextBytes > MAX_D1_JSON_BIND_BYTES) {
      chunks.push(chunk)
      chunk = []
      chunkBytes = 2
    }
    chunk.push(placement)
    chunkBytes += (chunk.length > 1 ? 1 : 0) + placementBytes
  }

  if (chunk.length) chunks.push(chunk)
  return chunks
}

function createMenuItemMediaBatchQueries(
  plans: CreatedMenuItemPlan[],
  input: { organizationId: string; siteId: string; now: string },
): BatchQuery[] {
  const placements = plans.flatMap(plan => plan.media.map((media, sortOrder) => ({
    id: crypto.randomUUID(),
    owner_id: plan.id,
    asset_id: media.asset_id,
    sort_order: sortOrder,
  })))
  return chunkMenuItemMediaPlacements(placements).map(chunk => ({
    query: `INSERT INTO media_placements (
      id, organization_id, site_id, owner_type, owner_id, slot, asset_id,
      sort_order, status, created_at, updated_at
    )
    SELECT
      json_extract(value, '$.id'), ?, ?, 'menu_item',
      json_extract(value, '$.owner_id'), 'gallery',
      json_extract(value, '$.asset_id'),
      CAST(json_extract(value, '$.sort_order') AS INTEGER),
      'active', ?, ?
    FROM json_each(?)`,
    params: [
      input.organizationId,
      input.siteId,
      input.now,
      input.now,
      d1JsonValue(chunk),
    ],
  }))
}

function updateMenuItemBatchQuery(item: MenuItem, updates: UpdateMenuItemRequest, slug: string, now: string, actorId: string): BatchQuery {
  assertValidSaleWindow(updates.sale_starts_at, updates.sale_ends_at)
  const sets: string[] = []
  const params: unknown[] = []
  const add = (column: string, value: unknown) => {
    sets.push(`${column} = ?`)
    params.push(value)
  }
  if (updates.section !== undefined) add('section', updates.section)
  if (updates.name !== undefined) {
    add('name', updates.name)
    add('slug', slug)
  }
  if (updates.description !== undefined) add('description', updates.description || null)
  if (updates.price_amount !== undefined) add('price_amount', normalizePriceAmount(updates.price_amount))
  if (updates.compare_at_price_amount !== undefined) add('compare_at_price_amount', normalizePriceAmount(updates.compare_at_price_amount))
  if (updates.sale_starts_at !== undefined) add('sale_starts_at', updates.sale_starts_at || null)
  if (updates.sale_ends_at !== undefined) add('sale_ends_at', updates.sale_ends_at || null)
  if (updates.available !== undefined) add('available', updates.available)
  if (updates.featured !== undefined) add('featured', updates.featured)
  if (updates.featured_sort_order !== undefined) add('featured_sort_order', updates.featured_sort_order)
  if (updates.sort_order !== undefined) add('sort_order', updates.sort_order)
  if (updates.allergens !== undefined) add('allergens', JSON.stringify(updates.allergens))
  if (updates.ingredients !== undefined) add('ingredients', JSON.stringify(updates.ingredients))
  if (updates.dietary_notes !== undefined) add('dietary_notes', JSON.stringify(updates.dietary_notes))
  if (updates.preparation !== undefined) add('preparation', updates.preparation || null)
  if (updates.serving_note !== undefined) add('serving_note', updates.serving_note || null)
  if (updates.seo_title !== undefined) add('seo_title', updates.seo_title || null)
  if (updates.seo_description !== undefined) add('seo_description', updates.seo_description || null)
  if (updates.canonical_url !== undefined) add('canonical_url', updates.canonical_url || null)
  if (updates.robots !== undefined) add('robots', updates.robots || null)
  if (Object.keys(updates).some(key => !['available', 'featured', 'featured_sort_order', 'sort_order', 'seo_title', 'seo_description', 'canonical_url', 'robots'].includes(key))) {
    add('source', 'manual')
  }
  add('updated_at', now)
  add('updated_by', actorId)
  params.push(item.id)
  return { query: `UPDATE menu_items SET ${sets.join(', ')} WHERE id = ?`, params }
}

export async function handleMenusTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_menus":
      {
        const menus = await getMenus(
          site.db,
          site.organizationId,
          site.siteId,
          optionalString(args, "location_id"),
        );
        const page = paginateMcpCollection(menus, args, { resource: `menus:${site.siteId}` });
        return { menus: page.items, page_info: page.page_info };
      }
    case "get_menu":
      {
        const menu = await getMenuWithItems(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
        );
        if (!menu) throw mcpProtocolError(MCP_ERROR.invalidParams, 'Menu not found.');
        const page = paginateMcpCollection(menu.items, args, {
          resource: `menu-items:${site.siteId}:${menu.id}`,
          revision: menu.updated_at,
        });
        return { menu: { ...menu, items: page.items }, item_page_info: page.page_info };
      }
    case "create_menu":
      {
        const menu = await createMenu(
          site.db,
          site.organizationId,
          site.siteId,
          {
            name: requiredString(args, "name"),
            description: optionalString(args, "description") ?? undefined,
            locationId: optionalString(args, "location_id") ?? null,
          },
          site.userId,
        );
        const createMenuContext = await mutationContextPayload(site, {
          locationId: typeof menu.location_id === "string" ? menu.location_id : null,
        });
        return renderStructuredResponse(
          {
            ok: true,
            entity: "menu",
            id: menu.id,
            updated_at: menu.updated_at,
            context: createMenuContext,
          },
          `Created menu "${menu.name}".`,
          { menu },
        );
      }
    case "update_menu":
      {
        const menu = await updateMenu(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
          omit(args, ["menu_id"]) as never,
          site.userId,
        );
        const updateMenuContext = await mutationContextPayload(site, {
          locationId: typeof menu.location_id === "string" ? menu.location_id : null,
        });
        return renderStructuredResponse(
          {
            ok: true,
            entity: "menu",
            id: menu.id,
            changed_fields: Object.keys(omit(args, ["menu_id"])),
            updated_at: menu.updated_at,
            context: updateMenuContext,
          },
          `Updated menu "${menu.name}".`,
          { menu },
        );
      }
    case "delete_menu":
      {
        const menuId = requiredString(args, "menu_id");
        const locationId = await resolveMenuLocationId(site.db, site.organizationId, site.siteId, menuId);
        await deleteMenu(site.db, site.organizationId, site.siteId, menuId);
        return { deleted: true, context: await mutationContextPayload(site, { locationId }) };
      }
    case "create_menu_item": {
      const createMenuItemArgs = normalizeMenuItemArgs(args, {
        requireSection: true,
      });
      const item = await createMenuItem(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(createMenuItemArgs, "menu_id"),
          omit(createMenuItemArgs, ["menu_id"]) as never,
          site.userId,
        );
      const createItemContext = await mutationContextPayload(site, {
        locationId: await resolveMenuLocationId(
          site.db,
          site.organizationId,
          site.siteId,
          item.menu_id,
        ),
      });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "menu_item",
          id: item.id,
          slug: item.slug,
          updated_at: item.updated_at,
          context: createItemContext,
        },
        `Added "${item.name}" to the menu.`,
        { item },
      );
    }
    case "add_menu_items_batch": {
      const menuId = requiredString(args, "menu_id");
      const menu = await getMenuWithItems(
        site.db,
        site.organizationId,
        site.siteId,
        menuId,
      );
      if (!menu) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Menu not found.");
      }

      const items = objectArray(args.items, "items");
      if (items.length < 1 || items.length > MAX_MENU_BATCH_ITEMS) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `items must contain between 1 and ${MAX_MENU_BATCH_ITEMS} entries.`);
      }
      const siteSlugs = await queryAll<{ slug: string }>(site.db, `
        SELECT mi.slug FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE m.site_id = ?
      `, [site.siteId]);
      const reservedSlugs = new Set(siteSlugs.map(row => row.slug).filter(Boolean));
      const existingKeys = new Set(
        menu.items.map((item) => item.slug || menuItemLookupKey(item.name)),
      );
      const inputKeys = new Set<string>();
      const plans: CreatedMenuItemPlan[] = [];
      const created: Array<{
        id: string;
        name: string;
        section: string;
        price_amount: string | number | null;
      }> = [];
      const skipped: Array<{
        name: string;
        reason: string;
        existing_item_id?: string;
      }> = [];

      for (const rawItemRecord of items) {
        const itemRecord = normalizeMenuItemArgs(rawItemRecord, { requireSection: false });
        const name = toolString(itemRecord, "name", 200)?.trim() ?? "";
        if (!name) {
          skipped.push({ name: "", reason: "missing_name" });
          continue;
        }

        const section = toolString(itemRecord, "section", 100)?.trim() ?? "";
        if (!section) {
          skipped.push({ name, reason: "missing_section" });
          continue;
        }

        const key = menuItemLookupKey(name);
        const existing = menu.items.find(
          (menuItem) =>
            menuItem.slug === key ||
            menuItem.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing || existingKeys.has(key)) {
          skipped.push({
            name,
            reason: "already_exists",
            existing_item_id: existing?.id,
          });
          continue;
        }
        if (inputKeys.has(key)) {
          skipped.push({ name, reason: "duplicate_in_request" });
          continue;
        }

        inputKeys.add(key);

        const id = crypto.randomUUID();
        const media = Object.hasOwn(itemRecord, 'media') ? parseMediaAssetRefs(itemRecord.media) : [];
        plans.push({ id, item: itemRecord, name, section, slug: allocateMenuItemSlug(name, reservedSlugs), media });
        existingKeys.add(key);
        created.push({
          id,
          name,
          section,
          price_amount: normalizePriceAmount(itemRecord.price_amount as string | number | null | undefined),
        });
      }

      const distinctMedia = [...new Map(
        plans.flatMap(plan => plan.media).map(media => [media.asset_id, media]),
      ).values()];
      if (distinctMedia.length) {
        await hydrateMediaAssetRefs(site.db, {
          organizationId: site.organizationId,
          siteId: site.siteId,
          refs: distinctMedia,
          allowedKinds: ['image', 'video'],
          fieldName: 'items.media',
        });
      }

      if (plans.length) {
        const now = new Date().toISOString();
        const sectionOrder = [...(menu.section_order ?? [])];
        for (const plan of plans) if (!sectionOrder.includes(plan.section)) sectionOrder.push(plan.section);
        const mediaQueries = createMenuItemMediaBatchQueries(plans, {
          organizationId: site.organizationId,
          siteId: site.siteId,
          now,
        });
        const queries: BatchQuery[] = plans.map(plan => createMenuItemBatchQuery(menuId, plan, now, site.userId));
        queries.push(...mediaQueries);
        queries.push({
          query: `UPDATE menus SET section_order = ?, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ?`,
          params: [JSON.stringify(sectionOrder), now, site.userId, menuId, site.organizationId, site.siteId],
        });
        try {
          await executeBatch(site.db, queries, { operation: 'add menu items batch' });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          throw mcpProtocolError(MCP_ERROR.invalidParams, 'The menu changed during this batch. No items were added; read the menu and retry.');
        }
      }

      return { added: created.length, created, skipped, menu_id: menuId };
    }
    case "sync_menu_items": {
      const menuId = requiredString(args, "menu_id");
      const menu = await getMenuWithItems(site.db, site.organizationId, site.siteId, menuId);
      if (!menu) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Menu not found.");
      }

      const items = objectArray(args.items, "items");
      if (items.length < 1 || items.length > MAX_MENU_BATCH_ITEMS) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, `items must contain between 1 and ${MAX_MENU_BATCH_ITEMS} entries.`);
      }
      const workingItems = [...menu.items];
      const touchedItemIds = new Set<string>();
      const mutationQueries: BatchQuery[] = [];
      const siteSlugs = await queryAll<{ id: string; slug: string }>(site.db, `
        SELECT mi.id, mi.slug FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        WHERE m.site_id = ?
      `, [site.siteId]);
      const reservedSlugs = new Set(siteSlugs.map(row => row.slug).filter(Boolean));
      const now = new Date().toISOString();
      const created: Array<{ id: string; name: string; section: string; price_amount: string | number | null }> = [];
      const updated: Array<{ id: string; name: string; section: string; price_amount: string | number | null; available: boolean }> = [];
      const unchanged: Array<{ id: string; name: string }> = [];
      const skipped: Array<{ name: string; reason: string; item_id?: string }> = [];

      for (const rawItemRecord of items) {
        const itemRecord = normalizeMenuItemArgs(rawItemRecord, {
          requireSection: false,
        });
        const name = toolString(itemRecord, "name", 200)?.trim();
        const match = findMenuItemMatch(itemRecord, workingItems);

        if (match) {
          if (touchedItemIds.has(match.id)) {
            skipped.push({ name: name || match.name, reason: 'duplicate_in_request', item_id: match.id });
            continue;
          }
          const updates = buildMenuItemUpdates(itemRecord, match);
          touchedItemIds.add(match.id);

          if (Object.keys(updates).length === 0) {
            unchanged.push({ id: match.id, name: match.name });
            continue;
          }

          let slug = match.slug;
          if (updates.name !== undefined) {
            reservedSlugs.delete(match.slug);
            slug = allocateMenuItemSlug(updates.name, reservedSlugs);
          }
          mutationQueries.push(updateMenuItemBatchQuery(match, updates, slug, now, site.userId));
          const updatedItem = { ...match, ...updates, slug, updated_at: now, updated_by: site.userId } as MenuItem;
          const index = workingItems.findIndex((item) => item.id === updatedItem.id);
          if (index >= 0) workingItems[index] = updatedItem;
          updated.push({
            id: updatedItem.id,
            name: updatedItem.name,
            section: updatedItem.section,
            price_amount: updatedItem.price_amount,
            available: Boolean(updatedItem.available),
          });
          continue;
        }

        if (!name) {
          skipped.push({ name: "", reason: "missing_name" });
          continue;
        }
        const section = toolString(itemRecord, "section", 100)?.trim();
        if (!section) {
          skipped.push({ name, reason: "missing_section" });
          continue;
        }

        const duplicateKey = menuItemLookupKey(name);
        if (workingItems.some(item => (item.slug || menuItemLookupKey(item.name)) === duplicateKey)) {
          skipped.push({ name, reason: 'duplicate_in_request' });
          continue;
        }
        const id = crypto.randomUUID();
        const plan: CreatedMenuItemPlan = {
          id,
          item: itemRecord,
          name,
          section,
          slug: allocateMenuItemSlug(name, reservedSlugs),
          media: [],
        };
        mutationQueries.push(createMenuItemBatchQuery(menuId, plan, now, site.userId));
        const createdItem = {
          id,
          menu_id: menuId,
          section,
          name,
          slug: plan.slug,
          price_amount: normalizePriceAmount(itemRecord.price_amount as string | number | null | undefined),
          available: typeof itemRecord.available === 'boolean' ? itemRecord.available : true,
        } as MenuItem;
        workingItems.push(createdItem);
        touchedItemIds.add(id);
        created.push({ id, name, section, price_amount: createdItem.price_amount });
      }

      const madeUnavailable: Array<{ id: string; name: string }> = [];
      if (args.set_missing_unavailable === true) {
        for (const item of workingItems) {
          if (touchedItemIds.has(item.id) || !item.available) continue;
          madeUnavailable.push({ id: item.id, name: item.name });
        }
        if (madeUnavailable.length) {
          mutationQueries.push({
            query: `UPDATE menu_items SET available = 0, updated_at = ?, updated_by = ?
              WHERE menu_id = ? AND available != 0
                AND id NOT IN (SELECT value FROM json_each(?))`,
            params: [now, site.userId, menuId, JSON.stringify([...touchedItemIds])],
          });
        }
      }

      if (mutationQueries.length) {
        const activeSections = new Set(workingItems.map(item => item.section).filter(Boolean));
        const sectionOrder = (menu.section_order ?? []).filter(section => activeSections.has(section));
        for (const item of workingItems) if (item.section && !sectionOrder.includes(item.section)) sectionOrder.push(item.section);
        mutationQueries.push({
          query: `UPDATE menus SET section_order = ?, updated_at = ?, updated_by = ? WHERE id = ? AND organization_id = ? AND site_id = ?`,
          params: [JSON.stringify(sectionOrder), now, site.userId, menuId, site.organizationId, site.siteId],
        });
        try {
          await executeBatch(site.db, mutationQueries, { operation: 'sync menu items' });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          throw mcpProtocolError(MCP_ERROR.invalidParams, 'The menu changed during this sync. No changes were applied; read the menu and retry.');
        }
      }

      return {
        menu_id: menuId,
        created,
        updated,
        unchanged,
        made_unavailable: madeUnavailable,
        skipped,
        summary: {
          created: created.length,
          updated: updated.length,
          unchanged: unchanged.length,
          made_unavailable: madeUnavailable.length,
          skipped: skipped.length,
        },
        context: await mutationContextPayload(site, { locationId: menu.location_id ?? null }),
      };
    }
    case "update_menu_item": {
      const updateMenuItemArgs = normalizeMenuItemArgs(args, {
        requireSection: false,
      });
      const item = await updateMenuItem(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(updateMenuItemArgs, "menu_item_id"),
          omit(updateMenuItemArgs, ["menu_item_id"]) as never,
          site.userId,
        );
      const updateItemContext = await mutationContextPayload(site, {
        locationId: await resolveMenuLocationId(site.db, site.organizationId, site.siteId, item.menu_id),
      });
      return renderStructuredResponse(
        {
          ok: true,
          entity: "menu_item",
          id: item.id,
          slug: item.slug,
          changed_fields: Object.keys(omit(updateMenuItemArgs, ["menu_item_id"])),
          updated_at: item.updated_at,
          context: updateItemContext,
        },
        `Updated "${item.name}".`,
        { item },
      );
    }
    case "delete_menu_item": {
      const menuItemId = requiredString(args, "menu_item_id");
      const existing = await queryFirst<{ menu_id: string }>(
        site.db,
        `SELECT menu_id FROM menu_items WHERE id = ? LIMIT 1`,
        [menuItemId],
      );
      const deleted = await deleteMenuItem(
        site.db,
        menuItemId,
        site.organizationId,
        site.siteId,
        site.userId,
      );
      if (!deleted) {
        throw mcpProtocolError(MCP_ERROR.invalidParams, "Menu item not found or does not belong to this site.");
      }
      const locationId = existing?.menu_id
        ? await resolveMenuLocationId(site.db, site.organizationId, site.siteId, existing.menu_id)
        : null;
      return { deleted: true, context: await mutationContextPayload(site, { locationId }) };
    }
    case "rename_menu_section": {
      const menuId = requiredString(args, "menu_id");
      const updated = await renameMenuSection(
        site.db,
        site.organizationId,
        site.siteId,
        menuId,
        requiredString(args, "old_name"),
        requiredString(args, "new_name"),
        site.userId,
      ).catch(rethrowMenuOwnershipAsInvalidParams);
      return {
        updated,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(site.db, site.organizationId, site.siteId, menuId),
        }),
      };
    }
    case "delete_menu_section": {
      const menuId = requiredString(args, "menu_id");
      const deleted = await deleteMenuSection(
        site.db,
        site.organizationId,
        site.siteId,
        menuId,
        requiredString(args, "section_name"),
      ).catch(rethrowMenuOwnershipAsInvalidParams);
      return {
        deleted,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(site.db, site.organizationId, site.siteId, menuId),
        }),
      };
    }
    case "reorder_menu_items": {
      const menuId = requiredString(args, "menu_id");
      await reorderMenuItems(
        site.db,
        site.organizationId,
        site.siteId,
        menuId,
        objectArray(args.updates, "updates").map((item) => {
          const sortOrder = item.sort_order;
          if (
            typeof sortOrder !== "number" ||
            !Number.isFinite(sortOrder) ||
            !Number.isInteger(sortOrder)
          ) {
            throw mcpProtocolError(
              MCP_ERROR.invalidParams,
              "Each update must have an integer sort_order",
            );
          }
          return { id: requiredString(item, "id"), sort_order: sortOrder };
        }),
      ).catch(rethrowMenuOwnershipAsInvalidParams);
      return {
        updated: true,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(site.db, site.organizationId, site.siteId, menuId),
        }),
      };
    }
    default:
      return NOT_HANDLED
  }
}
