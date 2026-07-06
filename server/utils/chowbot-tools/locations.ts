import type { AiTool } from '~/server/utils/ai-gateway'

export const LOCATIONS_CHOWBOT_TOOLS: AiTool[] = [
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
              "Media asset ID for hero image — from generate_image, get_site_media_assets, or pending WhatsApp media.",
          },
          hero_video_asset_id: {
            type: "string",
            description:
              "Media asset ID for hero video — from get_site_media_assets or pending WhatsApp media.",
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
          email: { type: ["string", "null"], description: "Public email shown to guests on the website and in confirmation emails. Pass null to clear it." },
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
              "Media asset ID for hero image — from generate_image, get_site_media_assets, or pending WhatsApp media.",
          },
          hero_video_asset_id: {
            type: "string",
            description:
              "Media asset ID for hero video — from get_site_media_assets or pending WhatsApp media.",
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
]
