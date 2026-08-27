import type { AiTool } from '~/server/utils/ai-gateway'
import { CONTENT_TOOLS } from '~/server/utils/mcp-tools/content'
import { chowbotToolFromMcp } from './from-mcp'

const CONTENT_DOMAIN_TOOL_NAMES = new Set([
  'list_tenant_pages',
  'get_tenant_page',
  'create_tenant_page',
  'update_tenant_page',
  'change_tenant_page_path',
  'get_professional_service_content',
  'update_professional_service_content',
])

export const CONTENT_CHOWBOT_TOOLS: AiTool[] = CONTENT_TOOLS
  .filter((tool) => CONTENT_DOMAIN_TOOL_NAMES.has(tool.name))
  .map(chowbotToolFromMcp)
