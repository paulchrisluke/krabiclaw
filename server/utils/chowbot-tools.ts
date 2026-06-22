import type { AiTool } from "~/server/utils/ai-gateway";
import { contentRegistry } from "~/config/content-registry";
import { SUPPORTED_CURRENCIES } from "~/shared/currencies";

export const CHOWBOT_TOOLS: AiTool[] = [
  // ── Posts ──────────────────────────────────────────────────────────────────
  {
    name: "list_posts",
    description:
      "List posts for this site. Optionally filter by status or location.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["draft", "published", "archived"],
          description: "Filter by status. Omit to get all.",
        },
        location_id: {
          type: "string",
          description: "Filter to posts for a specific location.",
        },
      },
    },
  },
  {
    name: "create_post",
    description:
      "Create and publish a post immediately.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short headline (max 80 chars). Optional.",
        },
        body: {
          type: "string",
          description: "Post body (max 400 chars). Friendly, warm tone.",
        },
        image_asset_id: {
          type: "string",
          description:
            "Optional media asset ID from generate_image, get_location_media, or pending WhatsApp media.",
        },
        location_id: {
          type: "string",
          description:
            "Pin this post to a specific location. Omit for site-wide.",
        },
        post_type: {
          type: "string",
          enum: ["standard", "offer", "event", "update"],
          description: "Post type. Default: standard.",
        },
        cta_type: {
          type: "string",
          enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
          description: "Call-to-action button type.",
        },
        cta_url: { type: "string", description: "URL for the CTA button." },
        event_title: {
          type: "string",
          description: "Event name (for post_type: event).",
        },
        event_start: {
          type: "string",
          description: "Event start datetime ISO string.",
        },
        event_end: {
          type: "string",
          description: "Event end datetime ISO string.",
        },
        offer_coupon: {
          type: "string",
          description: "Coupon code (for post_type: offer).",
        },
        offer_terms: {
          type: "string",
          description: "Offer terms and conditions.",
        },
      },
      required: ["body"],
    },
  },
  {
    name: "publish_post",
    description:
      "Publish a post to external channels (Google Business, Facebook, Instagram). Only call after confirming with the user.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post to publish." },
      },
      required: ["post_id"],
    },
  },
  {
    name: "update_post",
    description:
      "Update a post — title, body, image, location, type, CTA, or event/offer fields.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post to update." },
        title: {
          type: "string",
          description: "New headline (max 80 chars). Omit to leave unchanged.",
        },
        body: {
          type: "string",
          description:
            "New post body (max 400 chars). Omit to leave unchanged.",
        },
        image_asset_id: {
          type: "string",
          description: "New media asset ID. Omit to leave unchanged.",
        },
        location_id: {
          type: "string",
          description: "Reassign to a location. Omit to leave unchanged.",
        },
        post_type: {
          type: "string",
          enum: ["standard", "offer", "event", "update"],
        },
        cta_type: {
          type: "string",
          enum: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
        },
        cta_url: { type: "string" },
        event_title: { type: "string" },
        event_start: { type: "string", description: "ISO datetime string." },
        event_end: { type: "string", description: "ISO datetime string." },
        offer_coupon: { type: "string" },
        offer_terms: { type: "string" },
      },
      required: ["post_id"],
    },
  },
  {
    name: "delete_post",
    description: "Permanently delete a post. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post to delete." },
      },
      required: ["post_id"],
    },
  },

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

  // ── Locations ──────────────────────────────────────────────────────────────
  {
    name: "list_locations",
    description: "List all locations for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_location",
    description: "Create a new location/branch.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Location name." },
        city: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        email: { type: "string" },
        website_url: { type: "string" },
        maps_url: { type: "string" },
        google_place_id: { type: "string" },
        description: { type: "string", description: "About this location." },
        short_description: { type: "string", description: "One-line tagline." },
        opening_hours: {
          type: "string",
          description: "Opening hours, one line per day.",
        },
        rating: {
          type: "number",
          description: "Manual review rating from 0 to 5.",
        },
        review_count: {
          type: "integer",
          description: "Manual total review count.",
        },
        price_level: {
          type: "string",
          enum: [
            "FREE",
            "INEXPENSIVE",
            "MODERATE",
            "EXPENSIVE",
            "VERY_EXPENSIVE",
          ],
        },
        facebook_url: { type: "string" },
        instagram_url: { type: "string" },
        tiktok_url: { type: "string" },
        grab_url: {
          type: "string",
          description: "Grab Food ordering link for this location.",
        },
        uber_eats_url: {
          type: "string",
          description: "Uber Eats ordering link for this location.",
        },
        foodpanda_url: {
          type: "string",
          description: "FoodPanda ordering link for this location.",
        },
        hero_image_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero image — from generate_image, get_location_media, or pending WhatsApp media.",
        },
        hero_video_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero video — from get_location_media or pending WhatsApp media.",
        },
        is_primary: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_location",
    description: "Update a location. Updating title auto-syncs the URL slug.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "ID from get_locations." },
        title: {
          type: "string",
          description: "New name — also updates URL slug.",
        },
        city: { type: "string" },
        neighborhood: {
          type: "string",
          description:
            'Short neighbourhood tag shown on location hero and cards, e.g. "Beachside · 2 min from Centre Point".',
        },
        phone: { type: "string", description: "Public phone number shown to guests on the website and in confirmation emails." },
        address: { type: "string" },
        email: { type: "string", description: "Public email shown to guests on the website and in confirmation emails." },
        notification_phone: {
          type: "string",
          description: "Internal WhatsApp number for booking/reservation alerts to this location's manager. Not shown to guests. Falls back to the site-level whatsapp_phone if not set. International format: +66812345678",
        },
        website_url: { type: "string" },
        maps_url: { type: "string" },
        google_place_id: { type: "string" },
        description: { type: "string", description: "About this location." },
        short_description: { type: "string", description: "One-line tagline." },
        opening_hours: {
          type: "string",
          description: "Opening hours, one line per day.",
        },
        rating: {
          type: "number",
          description: "Manual review rating from 0 to 5.",
        },
        review_count: {
          type: "integer",
          description: "Manual total review count.",
        },
        price_level: {
          type: "string",
          enum: [
            "FREE",
            "INEXPENSIVE",
            "MODERATE",
            "EXPENSIVE",
            "VERY_EXPENSIVE",
          ],
        },
        facebook_url: { type: "string" },
        instagram_url: { type: "string" },
        tiktok_url: { type: "string" },
        grab_url: {
          type: "string",
          description: "Grab Food ordering link for this location.",
        },
        uber_eats_url: {
          type: "string",
          description: "Uber Eats ordering link for this location.",
        },
        foodpanda_url: {
          type: "string",
          description: "FoodPanda ordering link for this location.",
        },
        hero_image_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero image — from generate_image, get_location_media, or pending WhatsApp media.",
        },
        hero_video_asset_id: {
          type: "string",
          description:
            "Media asset ID for hero video — from get_location_media or pending WhatsApp media.",
        },
        is_primary: { type: "boolean" },
        status: { type: "string", enum: ["active", "inactive", "sync_error"] },
      },
      required: ["location_id"],
    },
  },
  {
    name: "delete_location",
    description:
      "Permanently delete a location/branch. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "ID from get_locations." },
      },
      required: ["location_id"],
    },
  },

  // ── Maps lookup ────────────────────────────────────────────────────────────
  {
    name: "import_from_maps",
    description:
      "Look up a Google Maps URL or share link to get location details — address, phone, coordinates, hours. Use when someone pastes a Google Maps link and wants to update their location details. After getting results, call update_location with the relevant fields.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Google Maps URL or share link (e.g. https://maps.app.goo.gl/... or https://www.google.com/maps/place/...)",
        },
      },
      required: ["url"],
    },
  },

  // ── Reviews ────────────────────────────────────────────────────────────────
  {
    name: "list_location_reviews",
    description:
      "Get reviews for a location, including aggregate score and star distribution.",
    input_schema: {
      type: "object",
      properties: {
        location_id: {
          type: "string",
          description: "Location ID from get_locations.",
        },
      },
      required: ["location_id"],
    },
  },
  {
    name: "reply_to_review",
    description: "Add or update the owner reply on a review.",
    input_schema: {
      type: "object",
      properties: {
        review_id: {
          type: "string",
          description: "Review ID from get_reviews.",
        },
        reply: { type: "string", description: "Owner reply text." },
      },
      required: ["review_id", "reply"],
    },
  },

  // ── Media ──────────────────────────────────────────────────────────────────
  {
    name: "get_site_media_assets",
    description: "List media assets (images, videos) for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: {
          type: "string",
          description: "Location ID from get_locations.",
        },
        kind: {
          type: "string",
          enum: ["image", "video", "file"],
          description: "Filter by media type. Omit for all.",
        },
      },
      required: ["location_id"],
    },
  },
  {
    name: "delete_media_asset",
    description:
      "Delete a media asset from the library and Cloudflare storage. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: {
          type: "string",
          description: "ID from get_location_media.",
        },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "import_menu_from_media",
    description:
      "Import menu items from the currently pending WhatsApp image or document. Use only when the user asks to import, extract, or read menu items from the pending file.",
    input_schema: {
      type: "object",
      properties: {
        menu_name: { type: "string", description: "Optional menu name." },
      },
    },
  },
  {
    name: "resolve_pending_media",
    description:
      "Clear the pending WhatsApp media state. Call with action=save_media after assigning the asset to any tool (menu item, hero, post, etc.) or when the user just wants it saved to the library. Call with action=cancel to discard.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["save_media", "cancel"] },
      },
      required: ["action"],
    },
  },
  {
    name: "generate_image",
    description:
      "Generate an AI image from a text prompt using the configured OpenAI image model. The image is automatically saved to the media library. Use for menu item photos, hero images, or social posts.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Describe the image. Include food type, style, plating, lighting. Be specific.",
        },
        location_id: {
          type: "string",
          description:
            "Optional: attach the generated image to a specific location.",
        },
      },
      required: ["prompt"],
    },
  },

  // ── Q&A ────────────────────────────────────────────────────────────────────
  {
    name: "list_location_qa",
    description: "Get Q&A pairs for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
      },
      required: ["location_id"],
    },
  },
  {
    name: "create_location_qa",
    description: "Add a Q&A pair to a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        question: { type: "string" },
        answer: {
          type: "string",
          description: "Owner answer. Optional — can be added later.",
        },
      },
      required: ["location_id", "question"],
    },
  },
  {
    name: "delete_location_qa",
    description: "Delete a Q&A entry. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        qa_id: { type: "string" },
        location_id: { type: "string" },
      },
      required: ["qa_id", "location_id"],
    },
  },

  // ── Submissions ────────────────────────────────────────────────────────────
  {
    name: "get_contact_inquiries",
    description: "List contact form submissions for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_reservation_inquiries",
    description: "List reservation requests for this site.",
    input_schema: { type: "object", properties: {} },
  },

  // ── Site Content ──────────────────────────────────────────────────────────
  {
    name: "get_page_fields",
    description:
      "Read the current live content for a tenant site page.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page to inspect.",
        },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page"],
    },
  },
  {
    name: "update_page_content",
    description: "Save a value for a site page field.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page to update.",
        },
        field: {
          type: "string",
          description: "Field key from the content registry.",
        },
        value: { type: "string", description: "New field value." },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page", "field", "value"],
    },
  },
  {
    name: "delete_content_field",
    description:
      "Delete a site page field from live content. Confirm with the user first.",
    input_schema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(contentRegistry),
          description: "Site page that owns the field.",
        },
        field: {
          type: "string",
          description: "Field key from the content registry.",
        },
        location_id: {
          type: "string",
          description: "Optional location scope for location-specific pages.",
        },
      },
      required: ["page", "field"],
    },
  },

  // ── Site ───────────────────────────────────────────────────────────────────
  {
    name: "get_site_stats",
    description:
      "Summary of site content: posts, menus, menu items, locations, reviews.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "rename_site",
    description: "Update the brand name and subdomain/URL slug of the site.",
    input_schema: {
      type: "object",
      properties: {
        brand_name: { type: "string", description: "New brand name." },
      },
      required: ["brand_name"],
    },
  },
  {
    name: "set_default_currency",
    description: "Set the default menu currency for this site.",
    input_schema: {
      type: "object",
      properties: {
        currency: { type: "string", enum: [...SUPPORTED_CURRENCIES] },
      },
      required: ["currency"],
    },
  },
  {
    name: "save_brand_description",
    description:
      "Save a one-line brand description for the site homepage and SEO.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "One-line brand description.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "update_site_social",
    description:
      "Set site-wide social media links, footer tagline, and brand contact emails. Pass only the fields to change; omit the rest.",
    input_schema: {
      type: "object",
      properties: {
        facebook_url: {
          type: "string",
          description: "Full Facebook page URL. Empty string to clear.",
        },
        instagram_url: {
          type: "string",
          description: "Full Instagram profile URL. Empty string to clear.",
        },
        tiktok_url: {
          type: "string",
          description: "Full TikTok profile URL. Empty string to clear.",
        },
        footer_tagline: {
          type: "string",
          description:
            "Short tagline shown in the site footer. Empty string to clear.",
        },
        press_email: {
          type: "string",
          description:
            "Email for press inquiries. Shown on brand contact page. Empty string to clear.",
        },
        partnerships_email: {
          type: "string",
          description:
            "Email for partnership inquiries. Empty string to clear.",
        },
        catering_email: {
          type: "string",
          description:
            "Email for catering and events inquiries. Empty string to clear.",
        },
        careers_email: {
          type: "string",
          description:
            "Email for careers/job inquiries. Empty string to clear.",
        },
      },
    },
  },
  {
    name: "list_locales",
    description:
      "List the source language and enabled translation languages for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "upsert_locale",
    description:
      "Create or update a site language. Use this for source language, draft/published/disabled status, display label, and source fallback.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "BCP-47 locale code, such as en, th, fr, ja, or zh-CN.",
        },
        label: {
          type: "string",
          description: "Optional display label shown in dashboard controls.",
        },
        status: {
          type: "string",
          enum: ["draft", "published", "disabled"],
          description: "Public availability for this locale.",
        },
        fallback_enabled: {
          type: "boolean",
          description:
            "Whether missing translated content falls back to the source language.",
        },
        is_source: {
          type: "boolean",
          description: "Set true to make this locale the source language.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "delete_locale",
    description:
      "Remove a non-source site language. Confirm with the user first.",
    input_schema: {
      type: "object",
      properties: {
        locale: { type: "string", description: "Locale code to remove." },
      },
      required: ["locale"],
    },
  },
  {
    name: "get_translation_inventory",
    description:
      "Estimate translation scope and AI credits before translating a site language. Use before starting translation work.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "Target locale code, such as th or fr.",
        },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Which part of the site to estimate.",
        },
        include_published: {
          type: "boolean",
          description:
            "Include already published translations in the estimate.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "start_translation_job",
    description:
      "Create a queued translation job after the user approves the estimate. This queues work but does not translate immediately.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "Target locale code, such as th or fr.",
        },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Which part of the site to translate.",
        },
        include_published: {
          type: "boolean",
          description: "Include already published translations.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "list_translation_jobs",
    description: "List recent translation jobs for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_translation_job",
    description: "Inspect a translation job and its queued items.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "run_translation_job_batch",
    description:
      "Run one batch of an approved queued translation job. This calls AI, charges credits, and saves draft translations. Confirm before using.",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
      },
      required: ["job_id"],
    },
  },
  {
    name: "publish_translations",
    description:
      "Publish matching draft translations for a locale and scope so they become visible on the public site. Confirm before using.",
    input_schema: {
      type: "object",
      properties: {
        locale: {
          type: "string",
          description: "Target locale code, such as th or fr.",
        },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Which translated drafts to publish.",
        },
      },
      required: ["locale"],
    },
  },

  // ── Experiences ───────────────────────────────────────────────────────────
  {
    name: "list_experiences",
    description: "List all experiences for this site.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_experience",
    description:
      "Create a new bookable dining experience for this site. Every experience belongs to a location. If location_id is omitted, use the site primary location when available; if the site has multiple locations and it is not obvious, call list_locations first and ask.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: 'Experience name, e.g. "Teppanyaki Night".',
        },
        tagline: {
          type: "string",
          description: "One-line hook shown on the listing card.",
        },
        body: {
          type: "string",
          description:
            "Rich HTML body — full description, what's included, atmosphere, etc.",
        },
        price_amount: {
          type: ["number", "null"],
          description: "Numeric price amount, e.g. 1500. Uses site default currency. Preferred over price string. Pass null to clear.",
        },
        price: {
          type: ["string", "null"],
          description: 'Display override for non-numeric prices, e.g. "Ask us". Leave null when price_amount is set. Pass null to clear.',
        },
        featured: {
          type: "boolean",
          description:
            "Whether to feature this experience on the homepage/location pages (when no menu exists).",
        },
        featured_sort_order: {
          type: "number",
          description:
            "Sort order for featured experiences (lower numbers appear first).",
        },
        duration_minutes: {
          type: "number",
          description: "Duration in minutes, e.g. 90.",
        },
        max_capacity: {
          type: "number",
          description: "Maximum guests per booking.",
        },
        time_slots: {
          type: "array",
          items: { type: "string" },
          description: 'Available time slots, applied every day. e.g. ["17:00","19:00","21:00"]. Ignored if recurring_slots is set.',
        },
        recurring_slots: {
          type: ["object", "null"],
          description: 'Per-weekday time slots, e.g. {"Friday":["19:00","21:00"],"Saturday":["19:00","21:00"]}. Keys must be Monday..Sunday. When set, this takes priority over time_slots and a missing weekday means no slots that day. Omit or null to use time_slots every day instead.',
        },
        slot_start: {
          type: "string",
          description: 'Convenience: auto-generate slots from this "HH:MM" start time. Used with slot_end and slot_interval_minutes instead of typing time_slots by hand.',
        },
        slot_end: {
          type: "string",
          description: 'Convenience: auto-generate slots up to and including this "HH:MM" end time.',
        },
        slot_interval_minutes: {
          type: "number",
          description: "Convenience: interval in minutes between generated slots, e.g. 30.",
        },
        slot_weekday: {
          type: "string",
          enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          description: "If set alongside slot_start/slot_end/slot_interval_minutes, the generated slots are assigned to recurring_slots for this weekday instead of the flat time_slots list.",
        },
        available_note: {
          type: "string",
          description:
            'Human-readable availability, e.g. "Every Friday & Saturday".',
        },
        image_asset_id: {
          type: "string",
          description: "Media asset ID for hero image.",
        },
        location_id: {
          type: "string",
          description: "Optional ID from list_locations. If omitted, the site primary location is used when available.",
        },
        status: {
          type: "string",
          enum: ["active", "inactive", "sold_out"],
          description: "Default: active.",
        },
        seo_title: { type: "string", description: "SEO page title override." },
        seo_description: {
          type: "string",
          description: "SEO meta description (150–160 chars).",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_experience",
    description: "Update an existing experience — any combination of fields.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: {
          type: "string",
          description: "ID of the experience to update.",
        },
        title: { type: "string" },
        tagline: { type: "string" },
        body: { type: "string" },
        featured: {
          type: "boolean",
          description:
            "Whether to feature this experience on the homepage/location pages (when no menu exists).",
        },
        featured_sort_order: {
          type: "number",
          description:
            "Sort order for featured experiences (lower numbers appear first).",
        },
        price_amount: { type: ["number", "null"], description: "Numeric price amount. Preferred over price string. Pass null to clear." },
        price: { type: ["string", "null"], description: 'Display override for non-numeric prices, e.g. "Ask us". Pass null to clear.' },
        duration_minutes: { type: "number" },
        max_capacity: { type: "number" },
        time_slots: { type: "array", items: { type: "string" } },
        recurring_slots: {
          type: ["object", "null"],
          description: 'Per-weekday time slots, e.g. {"Friday":["19:00","21:00"]}. Takes priority over time_slots. Pass null to revert to the flat time_slots list every day.',
        },
        slot_start: { type: "string", description: 'Convenience: auto-generate slots from this "HH:MM" start time.' },
        slot_end: { type: "string", description: 'Convenience: auto-generate slots up to this "HH:MM" end time.' },
        slot_interval_minutes: { type: "number", description: "Convenience: interval in minutes between generated slots." },
        slot_weekday: {
          type: "string",
          enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          description: "If set alongside slot_start/slot_end/slot_interval_minutes, assigns generated slots to recurring_slots for this weekday.",
        },
        available_note: { type: "string" },
        image_asset_id: { type: "string" },
        location_id: {
          type: "string",
          description: "ID from list_locations. Moves the experience to a different location — cannot be cleared (an experience always belongs to exactly one location).",
        },
        status: { type: "string", enum: ["active", "inactive", "sold_out"] },
        sort_order: { type: "number" },
        seo_title: { type: "string" },
        seo_description: { type: "string" },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "delete_experience",
    description:
      "Permanently delete an experience and all its bookings. Confirm with user first.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: {
          type: "string",
          description: "ID of the experience to delete.",
        },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "list_experience_bookings",
    description: "List booking requests for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string", description: "Experience ID." },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "update_experience_booking",
    description: "Confirm or cancel a guest booking for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        booking_id: { type: "string" },
        status: { type: "string", enum: ["confirmed", "cancelled"] },
      },
      required: ["experience_id", "booking_id", "status"],
    },
  },
  {
    name: "get_experience_availability",
    description: "Get remaining capacity per time slot for an experience on a given date (or a run of consecutive dates).",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD start date." },
        days: { type: "number", description: "Number of consecutive days to check, default 1, max 31." },
      },
      required: ["experience_id", "date"],
    },
  },
  {
    name: "set_experience_slot_override",
    description: "Close or reopen a specific date+time-slot for an experience (e.g. mark Friday 7pm sold out without affecting other slots), or override its capacity for that date.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD." },
        time_slot: { type: "string", description: 'HH:MM — must be one of the experience\'s effective slots for that date.' },
        status: { type: "string", enum: ["closed", "open"] },
        capacity_override: { type: ["number", "null"], description: "Optional capacity just for this date+slot, overriding max_capacity. Pass null to clear." },
        note: { type: "string", description: "Optional internal note, e.g. reason for closing." },
      },
      required: ["experience_id", "date", "time_slot", "status"],
    },
  },
  {
    name: "list_experience_slot_overrides",
    description: "List manually closed/overridden date+time-slot combinations for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        from: { type: "string", description: "YYYY-MM-DD, defaults to today." },
        to: { type: "string", description: "YYYY-MM-DD, defaults to 90 days out." },
      },
      required: ["experience_id"],
    },
  },

  // ── Managed service work requests ─────────────────────────────────────────
  {
    name: "create_work_request",
    description:
      "Submit a work request to the Paul & Julia managed service queue. Use this when the owner needs something done that requires human attention — content updates, translations, photo work, SEO, Google Business management, seasonal campaigns, or anything beyond automated tools. Always confirm the details with the owner before submitting.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "content_update",
            "menu_update",
            "translation",
            "seo",
            "google_business",
            "seasonal",
            "photo_update",
            "social_media",
            "technical",
            "other",
          ],
          description: "Category of work needed.",
        },
        title: {
          type: "string",
          description:
            "Short summary of what needs to be done (max 120 chars).",
        },
        description: {
          type: "string",
          description:
            "Full details — what, where, any specific requirements or context.",
        },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
          description:
            "How urgent. Default: normal. Only use high/urgent if the owner specifically says so.",
        },
      },
      required: ["type", "title"],
    },
  },

  // ── Posts (single fetch) ───────────────────────────────────────────────────
  {
    name: "get_post",
    description: "Get a single post by ID, including full body and metadata.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string", description: "ID of the post." },
      },
      required: ["post_id"],
    },
  },
  {
    name: "set_post_image",
    description: "Set or replace the hero image on a post.",
    input_schema: {
      type: "object",
      properties: {
        post_id: { type: "string" },
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["post_id", "asset_id"],
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

  // ── Locations (single fetch + image setters) ───────────────────────────────
  {
    name: "get_location",
    description: "Get a single location by ID with full details.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string", description: "ID from list_locations." },
      },
      required: ["location_id"],
    },
  },
  {
    name: "set_location_hero_image",
    description: "Set the hero image for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["location_id", "asset_id"],
    },
  },
  {
    name: "set_location_hero_video",
    description: "Set the hero video for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["location_id", "asset_id"],
    },
  },

  // ── Site settings & media ─────────────────────────────────────────────────
  {
    name: "get_site_settings",
    description: "Read current site settings: brand name, description, logo, currency, social links, contact emails.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_logo",
    description: "Set the site logo from an existing media asset.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Media asset ID of the logo image." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "update_media_asset",
    description: "Update metadata on a media asset — alt text, title, or caption.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: { type: "string" },
        alt_text: { type: "string" },
        title: { type: "string" },
        caption: { type: "string" },
      },
      required: ["asset_id"],
    },
  },

  // ── Site content (hero + story image setters) ─────────────────────────────
  {
    name: "set_home_hero_image",
    description: "Set the home page hero image.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Media asset ID." },
        location_id: { type: "string", description: "Optional location scope." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "set_home_hero_video",
    description: "Set the home page hero video.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Media asset ID." },
        location_id: { type: "string", description: "Optional location scope." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "update_home_hero",
    description: "Update home hero title, subtitle, and/or media in one call.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        image_asset_id: { type: "string" },
        video_asset_id: { type: "string" },
        location_id: { type: "string", description: "Optional location scope." },
      },
    },
  },
  {
    name: "set_about_story_image",
    description: "Set the About page (/about) story image. Use set_home_story_image instead for the homepage story section.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["asset_id"],
    },
  },
  {
    name: "set_home_story_image",
    description: "Set the homepage (/) story image. Use set_about_story_image instead for the About page story section.",
    input_schema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["asset_id"],
    },
  },

  // ── Notification settings ─────────────────────────────────────────────────
  {
    name: "get_notification_settings",
    description: "Read notification settings for this site (e.g. WhatsApp phone).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_notification_settings",
    description: "Update notification settings for this site.",
    input_schema: {
      type: "object",
      properties: {
        whatsapp_phone: {
          type: "string",
          description: "WhatsApp phone number in E.164 format.",
        },
      },
      required: ["whatsapp_phone"],
    },
  },

  // ── Q&A ───────────────────────────────────────────────────────────────────
  {
    name: "update_location_qa",
    description: "Edit an existing Q&A entry — question, answer, status, or sort order.",
    input_schema: {
      type: "object",
      properties: {
        qa_id: { type: "string" },
        location_id: { type: "string" },
        question: { type: "string" },
        answer: { type: "string" },
        status: { type: "string", enum: ["published", "hidden"] },
        sort_order: { type: "integer" },
      },
      required: ["qa_id", "location_id"],
    },
  },
  {
    name: "reorder_location_qa",
    description: "Update the sort order of Q&A entries for a location.",
    input_schema: {
      type: "object",
      properties: {
        location_id: { type: "string" },
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              sort_order: { type: "integer" },
            },
            required: ["id", "sort_order"],
          },
        },
      },
      required: ["location_id", "updates"],
    },
  },

  // ── Work requests ─────────────────────────────────────────────────────────
  {
    name: "list_work_requests",
    description: "List submitted work requests for this organisation, ordered by status and priority.",
    input_schema: { type: "object", properties: {} },
  },

  // ── Experiences (single fetch + image/video setters) ──────────────────────
  {
    name: "get_experience",
    description: "Get a single experience by ID with full details.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
      },
      required: ["experience_id"],
    },
  },
  {
    name: "set_experience_image",
    description: "Set the hero image for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["experience_id", "asset_id"],
    },
  },
  {
    name: "set_experience_video",
    description: "Set the hero video for an experience.",
    input_schema: {
      type: "object",
      properties: {
        experience_id: { type: "string" },
        asset_id: { type: "string", description: "Media asset ID." },
      },
      required: ["experience_id", "asset_id"],
    },
  },

  // ── Translation review ────────────────────────────────────────────────────
  {
    name: "get_translation_review_items",
    description: "List pending translation review items for a locale and optional scope.",
    input_schema: {
      type: "object",
      properties: {
        locale: { type: "string", description: "Target locale code." },
        scope: {
          type: "string",
          enum: ["site", "content", "menus", "locations", "posts"],
          description: "Limit to a content scope. Omit for all.",
        },
        status: {
          type: "string",
          enum: ["missing", "draft", "published", "stale", "all"],
          description: "Filter by translation status. Omit for all.",
        },
      },
      required: ["locale"],
    },
  },
  {
    name: "save_translation_review_item",
    description: "Accept or edit a translated string in the translation review queue.",
    input_schema: {
      type: "object",
      properties: {
        locale: { type: "string", description: "Target locale code." },
        entity_type: {
          type: "string",
          enum: ["site_content", "menu", "menu_item", "business_location", "post"],
          description: "The type of entity being translated.",
        },
        entity_id: { type: "string", description: "ID of the entity being translated." },
        field: { type: "string", description: "The field name being translated." },
        fields: {
          type: "object",
          description: "Map of field keys to translated string values.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["locale", "entity_type", "entity_id", "field", "fields"],
    },
  },
];

export const CHOWBOT_CONFIRM_REQUIRED = new Set([
  "create_post",
  "publish_post",
  "delete_post",
  "publish_menu",
  "delete_menu",
  "delete_menu_item",
  "delete_menu_section",
  "delete_location",
  "delete_media_asset",
  "delete_location_qa",
  "delete_content_field",
  "delete_locale",
  "start_translation_job",
  "run_translation_job_batch",
  "publish_translations",
  "delete_experience",
  "create_work_request",
]);
