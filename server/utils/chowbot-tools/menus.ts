import type { AiTool } from '~/server/utils/ai-gateway'
import { MENUS_TOOLS } from '~/server/utils/mcp-tools/menus'
import { chowbotToolFromMcp } from './from-mcp'

export const MENUS_CHOWBOT_TOOLS: AiTool[] = [
  // open_video_upload launches a ChatGPT-app UI widget
  // (uiResourceUri) that only that host can render — not applicable to
  // ChowBot's own chat surface, so it's excluded from the derived set.
  ...MENUS_TOOLS.filter((tool) => !tool.uiResourceUri).map(chowbotToolFromMcp),
  // publish_menu has no MCP equivalent — it's a ChowBot-only ergonomic
  // shortcut for update_menu({ status: 'published' }), which the shared
  // executor already supports. Kept here rather than as an MCP tool since
  // ChatGPT already has update_menu's status field for the same effect.
  {
    name: "publish_menu",
    description: "Publish a menu so it appears on the live site.",
    input_schema: {
      type: "object",
      properties: { menu_id: { type: "string" } },
      required: ["menu_id"],
    },
  },
]
