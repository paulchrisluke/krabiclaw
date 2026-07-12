import type { AiTool } from '~/server/utils/ai-gateway'
import { SETTINGS_TOOLS } from '~/server/utils/mcp-tools/settings'
import { chowbotToolFromMcp } from './from-mcp'

// Only get_dashboard_link is shared with MCP's settings domain — domain
// management (create_domain, sync_domain, etc.) is intentionally not
// exposed to ChowBot (see CLAUDE.md's Custom Domains section on ACME token
// rotation risk), so it's excluded here rather than derived wholesale.
const SETTINGS_DOMAIN_TOOL_NAMES = new Set(['get_dashboard_link'])

// get_site_settings/set_logo (mcp-tools/sites.ts) and update_media_asset
// (mcp-tools/media.ts) used to be hand-written here too, duplicating what's
// now properly derived in chowbot-tools/sites.ts and chowbot-tools/media.ts
// respectively — two chowbot-tools files each registering the same tool
// name, which lint-tool-parity.mjs's cross-file duplicate check now catches.
export const SETTINGS_CHOWBOT_TOOLS: AiTool[] = [
  // ── Dashboard links ────────────────────────────────────────────────────────
  ...SETTINGS_TOOLS.filter((tool) => SETTINGS_DOMAIN_TOOL_NAMES.has(tool.name)).map(chowbotToolFromMcp),
]
