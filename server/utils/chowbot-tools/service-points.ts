import type { AiTool } from '~/server/utils/ai-gateway'
import { SERVICE_POINT_TOOLS } from '~/server/utils/mcp-tools/service-points'
import { chowbotToolFromMcp } from './from-mcp'

export const SERVICE_POINT_CHOWBOT_TOOLS: AiTool[] = SERVICE_POINT_TOOLS.map(chowbotToolFromMcp)
