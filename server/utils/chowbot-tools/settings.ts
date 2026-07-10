import type { AiTool } from '~/server/utils/ai-gateway'
import { SETTINGS_TOOLS } from '~/server/utils/mcp-tools/settings'
import { chowbotToolFromMcp } from './from-mcp'

// Only get_dashboard_link is shared with MCP's settings domain — domain
// management (create_domain, sync_domain, etc.) is intentionally not
// exposed to ChowBot (see CLAUDE.md's Custom Domains section on ACME token
// rotation risk), so it's excluded here rather than derived wholesale.
const SETTINGS_DOMAIN_TOOL_NAMES = new Set(['get_dashboard_link'])

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
  ...SETTINGS_TOOLS.filter((tool) => SETTINGS_DOMAIN_TOOL_NAMES.has(tool.name)).map(chowbotToolFromMcp),
]
