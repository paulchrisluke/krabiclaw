import type { AiTool } from '~/server/utils/ai-gateway'
import { CONTENT_TOOLS } from '~/server/utils/mcp-tools/content'
import { chowbotToolFromMcp } from './from-mcp'

// get_booking_policy/preview_booking_policy/update_booking_policy are
// MCP-only (structured booking-policy editing not yet exposed to ChowBot,
// see docs/tool-parity.md). clear_home_hero_image/clear_home_hero_video
// were never offered to ChowBot either — no "clear" concept in its prompt
// today, not added here to stay within migrating existing overlap.
// open_home_hero_media_upload is a ChatGPT-app UI widget (uiResourceUri).
const CONTENT_DOMAIN_TOOL_NAMES = new Set([
  'get_page_fields',
  'update_page_content',
  'delete_content_field',
  'update_home_hero',
  'set_home_hero_image',
  'set_home_hero_video',
  'set_about_story_image',
  'set_home_story_image',
  'get_professional_service_content',
  'update_professional_service_content',
])

export const CONTENT_CHOWBOT_TOOLS: AiTool[] = CONTENT_TOOLS
  .filter((tool) => CONTENT_DOMAIN_TOOL_NAMES.has(tool.name))
  .map(chowbotToolFromMcp)
