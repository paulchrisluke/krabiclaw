import type { AiTool } from '~/server/utils/ai-gateway'

export const MENUS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Menus ──────────────────────────────────────────────────────────────────
    {
      name: "get_menu",
      description: "Get a menu with all its sections and items.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: {
            type: "string",
            description:
              "Specific menu ID. Omit to get the first available menu.",
          },
        },
      },
    },
  {
      name: "create_menu",
      description: "Create a new menu.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Menu name." },
          description: { type: "string", description: "Optional description." },
          location_id: {
            type: "string",
            description: "Link to a specific location.",
          },
        },
        required: ["name"],
      },
    },
  {
      name: "update_menu",
      description: "Update an existing menu's name or description.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string", description: "ID of the menu." },
          name: { type: "string", description: "New name." },
          description: {
            type: "string",
            description: "Optional new description.",
          },
        },
        required: ["menu_id"],
      },
    },
  {
      name: "rename_menu_section",
      description:
        "Rename a menu category/section, such as Appetizers, Drinks, Mains, or Desserts. Updates all items in that section.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string", description: "ID of the menu." },
          old_section: {
            type: "string",
            description: "Current section/category title.",
          },
          new_section: {
            type: "string",
            description: "New section/category title.",
          },
        },
        required: ["menu_id", "old_section", "new_section"],
      },
    },
  {
      name: "delete_menu_section",
      description:
        "Permanently delete a menu category/section and every item in it. Confirm with user first.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string", description: "ID of the menu." },
          section: {
            type: "string",
            description: "Section/category title to delete.",
          },
        },
        required: ["menu_id", "section"],
      },
    },
  {
      name: "add_menu_items_batch",
      description:
        "Add multiple brand-new menu items in one call. Do not use for edits, replacements, renamed items, revised prices, or existing menu content. Up to 100 items.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string", description: "Menu to add items to." },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                section: {
                  type: "string",
                  description: "Section/category name.",
                },
                name: { type: "string", description: "Dish name." },
                description: {
                  type: "string",
                  description: "Short description. Optional.",
                },
                price_amount: {
                  type: "string",
                  description:
                    'Numeric price amount only, without currency, e.g. "120". Optional.',
                },
                compare_at_price_amount: {
                  type: "string",
                  description:
                    "Regular/pre-sale price. Set alongside price_amount only when running a discount/sale the user asked for. Optional.",
                },
                sale_starts_at: {
                  type: "string",
                  description: "ISO 8601 date/time the sale becomes active. Optional.",
                },
                sale_ends_at: {
                  type: "string",
                  description: "ISO 8601 date/time the sale ends. Optional.",
                },
                image_asset_id: {
                  type: "string",
                  description:
                    "Media asset ID from generate_image or pending WhatsApp media. Optional.",
                },
                allergens: {
                  type: "array",
                  items: { type: "string" },
                  description: 'List of allergens, e.g. ["dairy", "nuts"].',
                },
                ingredients: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key ingredients.",
                },
                dietary_notes: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    'Dietary tags, e.g. ["V", "VG", "GF", "vegetarian", "vegan", "gluten-free"].',
                },
                preparation: {
                  type: "string",
                  description: "How the dish is prepared.",
                },
                serving_note: {
                  type: "string",
                  description: "Notes about serving size or accompaniment.",
                },
              },
              required: ["section", "name"],
            },
          },
        },
        required: ["menu_id", "items"],
      },
    },
  {
      name: "sync_menu_items",
      description:
        "Reconcile a menu item list with an existing menu. Use this for menu updates, replacements, revised prices/descriptions, renamed items, or mixed create/update work.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string", description: "Menu to update." },
          items: {
            type: "array",
            description:
              "Items to reconcile. Existing items match by item_id first, then by normalized name/slug.",
            items: {
              type: "object",
              properties: {
                item_id: {
                  type: "string",
                  description: "Existing menu item ID when known.",
                },
                section: {
                  type: "string",
                  description: "Section/category name.",
                },
                name: { type: "string", description: "Dish name." },
                description: {
                  type: "string",
                  description: "Short description. Optional.",
                },
                price_amount: {
                  type: "string",
                  description:
                    'Numeric price amount only, without currency, e.g. "120". Optional.',
                },
                compare_at_price_amount: {
                  type: "string",
                  description:
                    "Regular/pre-sale price. Set alongside price_amount only when running a discount/sale the user asked for. Optional.",
                },
                sale_starts_at: {
                  type: "string",
                  description: "ISO 8601 date/time the sale becomes active. Optional.",
                },
                sale_ends_at: {
                  type: "string",
                  description: "ISO 8601 date/time the sale ends. Optional.",
                },
                image_asset_id: {
                  type: "string",
                  description: "Media asset ID from generate_image. Optional.",
                },
                available: {
                  type: "boolean",
                  description: "Whether the item should be shown as available.",
                },
                allergens: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of allergens.",
                },
                ingredients: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key ingredients.",
                },
                dietary_notes: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    'Dietary tags, e.g. ["V", "VG", "GF", "vegetarian", "vegan", "gluten-free"].',
                },
                preparation: { type: "string" },
                serving_note: { type: "string" },
              },
            },
          },
          set_missing_unavailable: {
            type: "boolean",
            description:
              "Only true when the user explicitly asks to remove, replace, hide, or make omitted items unavailable.",
          },
        },
        required: ["menu_id", "items"],
      },
    },
  {
      name: "create_menu_item",
      description: "Add a single item to a menu.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string", description: "Menu to add to." },
          section: { type: "string", description: "Section/category." },
          name: { type: "string", description: "Dish name." },
          description: {
            type: "string",
            description: "Short description. Optional.",
          },
          price_amount: {
            type: "string",
            description: "Numeric price amount only, without currency. Optional.",
          },
          compare_at_price_amount: {
            type: "string",
            description:
              "Regular/pre-sale price. Set alongside price_amount only when running a discount/sale the user asked for. Optional.",
          },
          sale_starts_at: {
            type: "string",
            description: "ISO 8601 date/time the sale becomes active. Optional.",
          },
          sale_ends_at: {
            type: "string",
            description: "ISO 8601 date/time the sale ends. Optional.",
          },
          image_asset_id: {
            type: "string",
            description:
              "Media asset ID from generate_image or pending WhatsApp media. Optional.",
          },
          allergens: { type: "array", items: { type: "string" } },
          ingredients: { type: "array", items: { type: "string" } },
          dietary_notes: { type: "array", items: { type: "string" } },
          preparation: { type: "string" },
          serving_note: { type: "string" },
        },
        required: ["menu_id", "section", "name"],
      },
    },
  {
      name: "update_menu_item",
      description:
        "Update a menu item — name, numeric price amount, description, image, availability, featured status, allergens, ingredients, dietary tags, preparation, or serving note.",
      input_schema: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "ID of the item." },
          section: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price_amount: {
            type: "string",
            description: "Numeric price amount only, without currency.",
          },
          compare_at_price_amount: {
            type: "string",
            description:
              "Regular/pre-sale price. Set alongside price_amount only when running a discount/sale the user asked for.",
          },
          sale_starts_at: {
            type: "string",
            description: "ISO 8601 date/time the sale becomes active.",
          },
          sale_ends_at: {
            type: "string",
            description: "ISO 8601 date/time the sale ends.",
          },
          image_asset_id: {
            type: "string",
            description:
              "New media asset ID from generate_image or pending WhatsApp media.",
          },
          available: { type: "boolean" },
          featured: {
            type: "boolean",
            description:
              "Whether this item appears in the featured highlights on the home page.",
          },
          featured_sort_order: {
            type: "integer",
            description:
              "Order among featured items (lower = shown first). Only relevant when featured is true.",
          },
          allergens: { type: "array", items: { type: "string" } },
          ingredients: { type: "array", items: { type: "string" } },
          dietary_notes: { type: "array", items: { type: "string" } },
          preparation: { type: "string" },
          serving_note: { type: "string" },
        },
        required: ["item_id"],
      },
    },
  {
      name: "delete_menu_item",
      description: "Permanently delete one menu item. Confirm with user first.",
      input_schema: {
        type: "object",
        properties: {
          menu_item_id: { type: "string", description: "ID of the menu item to delete." },
        },
        required: ["menu_item_id"],
      },
    },
  {
      name: "publish_menu",
      description: "Publish a menu so it appears on the live site.",
      input_schema: {
        type: "object",
        properties: { menu_id: { type: "string" } },
        required: ["menu_id"],
      },
    },
  {
      name: "delete_menu",
      description:
        "Permanently delete a menu and all its items. Confirm with user first.",
      input_schema: {
        type: "object",
        properties: { menu_id: { type: "string" } },
        required: ["menu_id"],
      },
    },
  // ── Menus ─────────────────────────────────────────────────────────────────
    {
      name: "list_menus",
      description: "List all menus for this site.",
      input_schema: {
        type: "object",
        properties: {
          location_id: {
            type: "string",
            description: "Filter by location. Omit for all menus.",
          },
        },
      },
    },
  {
      name: "reorder_menu_items",
      description: "Update the sort_order of menu items within a menu.",
      input_schema: {
        type: "object",
        properties: {
          menu_id: { type: "string" },
          updates: {
            type: "array",
            description: "Array of { id, sort_order } objects.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Menu item ID." },
                sort_order: { type: "integer" },
              },
              required: ["id", "sort_order"],
            },
          },
        },
        required: ["menu_id", "updates"],
      },
    },
  {
      name: "set_menu_item_image",
      description: "Set or replace the image on a menu item.",
      input_schema: {
        type: "object",
        properties: {
          menu_item_id: { type: "string" },
          asset_id: { type: "string", description: "Media asset ID." },
        },
        required: ["menu_item_id", "asset_id"],
      },
    },
]
