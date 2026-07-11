import type { AiTool } from '~/server/utils/ai-gateway'
import { LOCATIONS_TOOLS } from '~/server/utils/mcp-tools/locations'
import { chowbotToolFromMcp } from './from-mcp'

// copy_location_batch, clear_location_hero_image/video, and
// open_location_media_upload (ChatGPT-app UI widget) were never offered to
// ChowBot — not added here to stay within migrating existing overlap.
const LOCATIONS_DOMAIN_TOOL_NAMES = new Set([
  'list_locations',
  'get_location',
  'create_location',
  'update_location',
  'delete_location',
  'set_location_hero_image',
  'set_location_hero_video',
])

export const LOCATIONS_CHOWBOT_TOOLS: AiTool[] = LOCATIONS_TOOLS
  .filter((tool) => LOCATIONS_DOMAIN_TOOL_NAMES.has(tool.name))
  .map(chowbotToolFromMcp)
