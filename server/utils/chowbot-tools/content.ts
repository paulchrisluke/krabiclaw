import type { AiTool } from '~/server/utils/ai-gateway'
import { contentRegistry } from '~/config/content-registry'

export const CONTENT_CHOWBOT_TOOLS: AiTool[] = [
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
      name: "get_professional_service_content",
      description: "Read Blawby/professional-service content: offerings, tenant pages, compliance text, consultation settings, navigation, and theme tokens.",
      input_schema: {
        type: "object",
        properties: {},
      },
    },
  {
      name: "update_professional_service_content",
      description: "Save Blawby/professional-service content. Pricing calculators must use structured data with source/effective metadata, not formulas or scripts.",
      input_schema: {
        type: "object",
        properties: {
          offerings: { type: "array", items: { type: "object" } },
          tenantPages: { type: "array", items: { type: "object" } },
          compliance: { type: "object" },
          consultation: { type: "object" },
          navigation: { type: "array", items: { type: "object" } },
          themeTokens: { type: "object" },
        },
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
]
