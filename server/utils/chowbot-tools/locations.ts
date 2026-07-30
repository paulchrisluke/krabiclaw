import type { AiTool } from '~/server/utils/ai-gateway'
import { LOCATIONS_TOOLS } from '~/server/utils/mcp-tools/locations'
import { chowbotToolFromMcp } from './from-mcp'

const LOCATIONS_DOMAIN_TOOL_NAMES = new Set([
  'list_locations',
  'get_location',
  'create_location',
  'update_location',
  'delete_location',
])

export const LOCATIONS_CHOWBOT_TOOLS: AiTool[] = LOCATIONS_TOOLS
  .filter((tool) => LOCATIONS_DOMAIN_TOOL_NAMES.has(tool.name))
  .map(chowbotToolFromMcp)
