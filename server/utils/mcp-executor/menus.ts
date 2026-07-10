import type { MenuItem, UpdateMenuItemRequest } from '~/server/types/menu'
import type { McpExecutorContext } from './shared'
import { queryFirst } from '~/server/db'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createMenu, createMenuItem, deleteMenu, deleteMenuItem, deleteMenuSection, getMenuWithItems, getMenus, MenuNotFoundError, renameMenuSection, reorderMenuItems, updateMenu, updateMenuItem } from '~/server/utils/menu-management'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'
import { NOT_HANDLED, isUniqueConstraintError, menuItemLookupKey, mutationContextPayload, normalizeMenuItemArgs, objectArray, omit, optionalString, requireActiveImageAsset, requiredString, resolveMenuLocationId, toolString } from './shared'

function toolBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key]
  return typeof value === 'boolean' ? value : undefined
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
  const imageAssetId = toolString(itemRecord, 'image_asset_id', 120)
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
  if (imageAssetId !== undefined && imageAssetId !== match?.image_asset_id) updates.image_asset_id = imageAssetId
  if (available !== undefined && available !== Boolean(match?.available)) updates.available = available
  if (allergens !== undefined) updates.allergens = allergens
  if (ingredients !== undefined) updates.ingredients = ingredients
  if (dietaryNotes !== undefined) updates.dietary_notes = dietaryNotes
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

export async function handleMenusTools(ctx: McpExecutorContext): Promise<unknown> {
  const { toolName, args, site } = ctx
  switch (toolName) {
    case "list_menus":
      return {
        menus: await getMenus(
          site.db,
          site.organizationId,
          site.siteId,
          optionalString(args, "location_id") ?? undefined,
        ),
      };
    case "get_menu":
      return {
        menu: await getMenuWithItems(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_id"),
        ),
      };
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
          omit(createMenuItemArgs, ["menu_id", "price"]) as never,
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

      const rawItems = args.items;
      if (!Array.isArray(rawItems)) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "items must be an array.",
        );
      }

      if (rawItems.length > 100) {
        throw mcpProtocolError(
          MCP_ERROR.invalidParams,
          "Maximum 100 items allowed per batch request.",
        );
      }
      const items = rawItems;
      const existingKeys = new Set(
        menu.items.map((item) => item.slug || menuItemLookupKey(item.name)),
      );
      const inputKeys = new Set<string>();
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

      for (const item of items) {
        const itemRecord =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : null;
        const name = itemRecord ? toolString(itemRecord, "name", 200)?.trim() : "";
        if (!itemRecord || !name) {
          skipped.push({ name: "", reason: "missing_name" });
          continue;
        }

        const section = itemRecord
          ? toolString(itemRecord, "section", 100)?.trim()
          : "";
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

        const createMenuItemArgs = normalizeMenuItemArgs(itemRecord, {
          requireSection: true,
        });
        try {
          const createdItem = await createMenuItem(
            site.db,
            site.organizationId,
            site.siteId,
            menuId,
            omit(createMenuItemArgs, ["price"]) as never,
            site.userId,
          );
          existingKeys.add(
            createdItem.slug || menuItemLookupKey(createdItem.name),
          );
          created.push({
            id: createdItem.id,
            name: createdItem.name,
            section: createdItem.section,
            price_amount: createdItem.price_amount,
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          skipped.push({ name, reason: "unique_conflict" });
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

      const items = objectArray(args.items, "items").slice(0, 100);
      const workingItems = [...menu.items];
      const touchedItemIds = new Set<string>();
      const created: Array<{ id: string; name: string; section: string; price_amount: string | number | null }> = [];
      const updated: Array<{ id: string; name: string; section: string; price_amount: string | number | null; available: boolean }> = [];
      const unchanged: Array<{ id: string; name: string }> = [];
      const skipped: Array<{ name: string; reason: string; item_id?: string }> = [];

      for (const itemRecord of items) {
        const name = toolString(itemRecord, "name", 200)?.trim();
        const match = findMenuItemMatch(itemRecord, workingItems);

        if (match) {
          const updates = buildMenuItemUpdates(itemRecord, match);
          touchedItemIds.add(match.id);

          if (Object.keys(updates).length === 0) {
            unchanged.push({ id: match.id, name: match.name });
            continue;
          }

          try {
            const updatedItem = await updateMenuItem(site.db, site.organizationId, site.siteId, match.id, updates, site.userId);
            const index = workingItems.findIndex((item) => item.id === updatedItem.id);
            if (index >= 0) workingItems[index] = updatedItem;
            updated.push({
              id: updatedItem.id,
              name: updatedItem.name,
              section: updatedItem.section,
              price_amount: updatedItem.price_amount,
              available: Boolean(updatedItem.available),
            });
          } catch (error) {
            if (!isUniqueConstraintError(error)) throw error;
            skipped.push({ name: name || match.name, reason: "unique_conflict", item_id: match.id });
          }
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

        try {
          const createdItem = await createMenuItem(
            site.db,
            site.organizationId,
            site.siteId,
            menuId,
            {
              section,
              name,
              description: toolString(itemRecord, "description", 500),
              price_amount: toolString(itemRecord, "price_amount", 50),
              compare_at_price_amount: toolString(itemRecord, "compare_at_price_amount", 50),
              sale_starts_at: toolString(itemRecord, "sale_starts_at", 50),
              sale_ends_at: toolString(itemRecord, "sale_ends_at", 50),
              image_asset_id: toolString(itemRecord, "image_asset_id", 120),
              available: toolBoolean(itemRecord, "available"),
            } as never,
            site.userId,
          );
          workingItems.push(createdItem);
          touchedItemIds.add(createdItem.id);
          created.push({ id: createdItem.id, name: createdItem.name, section: createdItem.section, price_amount: createdItem.price_amount });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          // The (menu_id, slug) unique constraint fired, meaning an item
          // already exists that this create attempt collided with — most
          // likely one findMenuItemMatch's in-memory snapshot didn't catch
          // (e.g. a slug collision on a name variant). Re-fetch fresh and
          // re-match so that item is marked touched — otherwise, if the
          // caller also passed set_missing_unavailable, this pre-existing
          // item would be wrongly disabled below for never having been
          // "touched" by this sync, even though it's exactly what the
          // input was trying to reference.
          const freshMenu = await getMenuWithItems(site.db, site.organizationId, site.siteId, menuId);
          const conflictingItem = freshMenu ? findMenuItemMatch(itemRecord, freshMenu.items) : null;
          if (conflictingItem) {
            touchedItemIds.add(conflictingItem.id);
            const index = workingItems.findIndex((wi) => wi.id === conflictingItem.id);
            if (index >= 0) workingItems[index] = conflictingItem;
            else workingItems.push(conflictingItem);
            skipped.push({ name, reason: "unique_conflict", item_id: conflictingItem.id });
          } else {
            skipped.push({ name, reason: "unique_conflict" });
          }
        }
      }

      const madeUnavailable: Array<{ id: string; name: string }> = [];
      if (args.set_missing_unavailable === true) {
        for (const item of workingItems) {
          if (touchedItemIds.has(item.id) || !item.available) continue;
          const updatedItem = await updateMenuItem(site.db, site.organizationId, site.siteId, item.id, { available: false }, site.userId);
          madeUnavailable.push({ id: updatedItem.id, name: updatedItem.name });
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
          omit(updateMenuItemArgs, ["menu_item_id", "price"]) as never,
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
    case "set_menu_item_image": {
      const assetId = requiredString(args, "asset_id");
      await requireActiveImageAsset(site.db, site.siteId, assetId, "asset_id");
      const item = await updateMenuItem(
          site.db,
          site.organizationId,
          site.siteId,
          requiredString(args, "menu_item_id"),
          { image_asset_id: assetId } as never,
          site.userId,
        );
      const setImageContext = await mutationContextPayload(site, {
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
          updated_at: item.updated_at,
          context: setImageContext,
        },
        `Updated image for "${item.name}".`,
        { item },
      );
    }
    case "open_menu_item_media_upload": {
      const menuItemId = requiredString(args, "menu_item_id");
      return renderStructuredResponse(
        {
          launched: true,
          resourceUri: MEDIA_UPLOAD_WIDGET_RESOURCE_URI,
          menu_item_id: menuItemId,
          context: { site_id: site.siteId, menu_item_id: menuItemId, accept: "image" },
        },
        "Media upload widget launched for this menu item.",
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
