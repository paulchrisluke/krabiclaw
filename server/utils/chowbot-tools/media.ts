import type { AiTool } from '~/server/utils/ai-gateway'

export const MEDIA_CHOWBOT_TOOLS: AiTool[] = [
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
            description: "ID from get_site_media_assets.",
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
]
