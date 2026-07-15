import type { AiTool } from '~/server/utils/ai-gateway'
import { MEDIA_TOOLS } from '~/server/utils/mcp-tools/media'
import { chowbotToolFromMcp } from './from-mcp'

// upload_user_media and open_media_upload are ChatGPT-attachment/UI-widget
// specific (chatgptFileInput, uiResourceUri) — not applicable to ChowBot,
// which has its own generate_image/WhatsApp-pending-media upload paths.
const MEDIA_DOMAIN_TOOL_NAMES = new Set([
  'get_site_media_assets',
  'update_media_asset',
  'delete_media_asset',
])

export const MEDIA_CHOWBOT_TOOLS: AiTool[] = [
  ...MEDIA_TOOLS.filter((tool) => MEDIA_DOMAIN_TOOL_NAMES.has(tool.name)).map(chowbotToolFromMcp),
  // import_menu_from_media: MCP requires asset_id directly (ChatGPT already
  // resolved one via upload_user_media); ChowBot instead resolves it from
  // WhatsApp's pending-media state, so asset_id isn't a real argument here —
  // deriving MCP's schema verbatim would mislead the model into thinking it
  // must supply one.
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
  // analyze_document: MCP requires asset_id directly (ChatGPT already
  // resolved one via upload_user_media). ChowBot instead resolves it from
  // WhatsApp's pending-media state, matching import_menu_from_media above.
    {
      name: "analyze_document",
      description:
        "Summarize, answer a question about, or extract information from the currently pending WhatsApp Markdown document (.md/.markdown) — grounded strictly in that file's content. Use only when the user asks to summarize, ask about, or read the pending document. Pass a question to get a grounded answer; omit it for a summary.",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string", description: "Optional question to answer using only the document content. Omit for a summary." },
        },
      },
    },
  // ── WhatsApp pending-media state (ChowBot-only, no MCP equivalent) ────────
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
  // ── Image generation (ChowBot's own AI gateway, no MCP equivalent) ────────
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
