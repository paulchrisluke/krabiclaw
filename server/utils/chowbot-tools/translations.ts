import type { AiTool } from '~/server/utils/ai-gateway'

export const TRANSLATIONS_CHOWBOT_TOOLS: AiTool[] = [
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
]
