import type { McpExecutorContext } from './shared'
import { queryFirst } from '~/server/db'
import { MCP_ERROR, mcpProtocolError } from '~/server/utils/mcp-protocol'
import { createMenu, createMenuItem, deleteMenu, deleteMenuItem, deleteMenuSection, getMenuWithItems, getMenus, MenuNotFoundError, renameMenuSection, reorderMenuItems, updateMenu, updateMenuItem } from '~/server/utils/menu-management'
import { renderStructuredResponse } from '~/server/utils/mcp-render'
import { MEDIA_UPLOAD_WIDGET_RESOURCE_URI } from '~/server/utils/mcp-widgets'
import { NOT_HANDLED, isUniqueConstraintError, menuItemLookupKey, mutationContextPayload, normalizeMenuItemArgs, objectArray, omit, optionalString, requireActiveImageAsset, requiredString, resolveMenuLocationId, toolString } from './shared'

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
        return {
          menu,
          context: await mutationContextPayload(site, {
            locationId:
              typeof menu.location_id === "string" ? menu.location_id : null,
          }),
        };
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
        return {
          menu,
          context: await mutationContextPayload(site, {
            locationId: typeof menu.location_id === "string" ? menu.location_id : null,
          }),
        };
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
      return {
        item,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(
            site.db,
            site.organizationId,
            site.siteId,
            item.menu_id,
          ),
        }),
      };
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
      return {
        item,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(site.db, site.organizationId, site.siteId, item.menu_id),
        }),
      };
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
      return {
        item,
        context: await mutationContextPayload(site, {
          locationId: await resolveMenuLocationId(
            site.db,
            site.organizationId,
            site.siteId,
            item.menu_id,
          ),
        }),
      };
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
