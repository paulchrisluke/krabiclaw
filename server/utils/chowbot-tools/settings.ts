import type { AiTool } from '~/server/utils/ai-gateway'
import { DASHBOARD_DESTINATIONS } from '~/server/utils/dashboard-links'

export const SETTINGS_CHOWBOT_TOOLS: AiTool[] = [
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
  // ── Dashboard links ────────────────────────────────────────────────────────
    {
      name: "get_dashboard_link",
      description:
        "Resolve a deep link into this site's org dashboard for a destination ChowBot can't act on directly (e.g. billing/subscription management has no chat tool). Use this so the reply can link straight to the right settings page instead of just naming it.",
      input_schema: {
        type: "object",
        properties: {
          destination: {
            type: "string",
            enum: Object.keys(DASHBOARD_DESTINATIONS),
            description: "Which dashboard page to link to.",
          },
        },
        required: ["destination"],
      },
    },
]
